import { and, db, eq } from "@databuddy/db";
import dayjs from "dayjs";
import {
	type InsightDelivery,
	insightGenerationConfigs,
	slackChannelBindings,
	slackIntegrations,
} from "@databuddy/db/schema";
import { decrypt } from "@databuddy/encryption";
import { env } from "@databuddy/env/insights";
import { formatNextStep, type WebsiteInvestigation } from "./persistence";
import { emitInsightsEvent } from "./lib/evlog-insights";

const SLACK_POST_URL = "https://slack.com/api/chat.postMessage";
const SLACK_POST_TIMEOUT_MS = 10_000;
const SLACK_RATE_LIMIT_ATTEMPTS = 3;
const SLACK_RATE_LIMIT_FALLBACK_MS = 1000;
const SLACK_RATE_LIMIT_MAX_WAIT_MS = 5000;
const SLACK_HEADER_MAX = 150;
const SLACK_SECTION_TEXT_MAX = 3000;

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

type DigestInsight = Pick<WebsiteInvestigation, "id" | "outcome" | "signal">;

export interface SlackBlock {
	accessory?: unknown;
	elements?: unknown[];
	text?: { emoji?: boolean; text: string; type: string };
	type: string;
}

export interface InsightSlackEffectPayload {
	blocks: SlackBlock[];
	channelId: string;
	organizationId: string;
	text: string;
	websiteId: string;
}

function escapeMrkdwn(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

const FULL_UUID_PATTERN =
	/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const TRUNCATED_UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-\.\.\./gi;

function userVisibleCopy(value: string): string {
	return value
		.replace(FULL_UUID_PATTERN, "the affected item")
		.replace(TRUNCATED_UUID_PATTERN, "the affected item");
}

function formatWebsiteLabel(
	websiteName: string | null | undefined,
	websiteDomain: string
): string {
	const name = websiteName?.trim();
	return name && name !== websiteDomain
		? `${name} (${websiteDomain})`
		: websiteDomain;
}

export function buildFallbackText(
	websiteName: string | null | undefined,
	websiteDomain: string
): string {
	return escapeMrkdwn(
		`Findings for ${formatWebsiteLabel(websiteName, websiteDomain)}`
	);
}

async function resolveDeliveries(
	organizationId: string
): Promise<InsightDelivery[]> {
	const [orgConfig] = await db
		.select({ deliveries: insightGenerationConfigs.deliveries })
		.from(insightGenerationConfigs)
		.where(eq(insightGenerationConfigs.organizationId, organizationId))
		.limit(1);
	return orgConfig?.deliveries ?? [];
}

async function loadBoundBotToken(
	organizationId: string,
	channelId: string
): Promise<{ bindingCount: number; token: string | null }> {
	const integrations = await db
		.select({ ciphertext: slackIntegrations.botTokenCiphertext })
		.from(slackChannelBindings)
		.innerJoin(
			slackIntegrations,
			and(
				eq(slackChannelBindings.integrationId, slackIntegrations.id),
				eq(slackIntegrations.organizationId, organizationId),
				eq(slackIntegrations.status, "active")
			)
		)
		.where(eq(slackChannelBindings.slackChannelId, channelId))
		.limit(2);
	if (integrations.length !== 1) {
		return { bindingCount: integrations.length, token: null };
	}
	const key = env.DATABUDDY_ENCRYPTION_KEY;
	return {
		bindingCount: 1,
		token: key ? decrypt(integrations[0].ciphertext, key) : null,
	};
}

function digestLabel(insight: DigestInsight): string {
	const hasAction = insight.outcome.next.type === "act";
	switch (insight.signal.insightType) {
		case "referrer_change":
		case "traffic_spike":
		case "positive_trend":
			return insight.signal.sentiment === "positive"
				? "Opportunity · Acquisition"
				: "Review · Traffic";
		case "conversion_leak":
			return hasAction ? "Fix · Conversion" : "Review · Conversion";
		case "funnel_regression":
			return hasAction ? "Fix · Funnel" : "Review · Conversion";
		case "error_spike":
		case "new_errors":
		case "persistent_error_hotspot":
		case "error_impact":
			return hasAction ? "Fix · Error" : "Review · Error";
		case "vitals_degraded":
		case "performance":
			return hasAction ? "Fix · Performance" : "Review · Performance";
		case "performance_improved":
		case "reliability_improved":
			return "Improvement · Reliability";
		case "quality_shift":
		case "segment_regression":
			return "Review · Data quality";
		default:
			return hasAction ? "Fix" : "Review";
	}
}

function digestEmoji(label: string): string {
	if (label.startsWith("Fix")) {
		return ":red_circle:";
	}
	if (label.startsWith("Opportunity") || label.startsWith("Improvement")) {
		return ":large_green_circle:";
	}
	return ":large_yellow_circle:";
}

function insightUrl(insightId: string): string {
	const base = env.DASHBOARD_URL ?? "https://app.databuddy.cc";
	return `${base}/insights/${insightId}`;
}

function quoted(value: string): string {
	return value
		.split("\n")
		.map((line) => `>${line}`)
		.join("\n");
}

function nextStepLine(insight: DigestInsight): string {
	return `*Next:* ${escapeMrkdwn(userVisibleCopy(formatNextStep(insight.outcome, insight.signal)))}`;
}

function formatPeriodDay(value: string): string {
	const parsed = dayjs(value);
	return parsed.isValid() ? parsed.format("MMM D") : value;
}

function summaryChip(insight: DigestInsight): string {
	const label = digestLabel(insight);
	const kind = label.startsWith("Fix")
		? "Fix"
		: label.startsWith("Opportunity") || label.startsWith("Improvement")
			? "Opportunity"
			: "Review";
	return `${kind} · ${formatPeriodDay(insight.signal.period.current.from)} to ${formatPeriodDay(insight.signal.period.current.to)}`;
}

export function buildBlocks(
	websiteName: string | null | undefined,
	websiteDomain: string,
	insight: DigestInsight
): SlackBlock[] {
	const websiteLabel = formatWebsiteLabel(websiteName, websiteDomain);
	const label = digestLabel(insight);
	const blocks: SlackBlock[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: truncate(`Findings for ${websiteLabel}`, SLACK_HEADER_MAX),
			},
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: truncate(summaryChip(insight), 255),
				},
			],
		},
	];
	blocks.push({
		type: "section",
		text: {
			type: "mrkdwn",
			text: truncate(
				`${digestEmoji(label)} *${escapeMrkdwn(userVisibleCopy(insight.outcome.title))}*`,
				SLACK_SECTION_TEXT_MAX
			),
		},
		accessory: {
			type: "button",
			text: { type: "plain_text", text: "Open", emoji: true },
			url: insightUrl(insight.id),
		},
	});

	const bodyLines = [
		quoted(escapeMrkdwn(userVisibleCopy(insight.outcome.summary))),
	];
	const impact = insight.outcome.impact?.trim();
	if (impact) {
		bodyLines.push(escapeMrkdwn(userVisibleCopy(impact)));
	}
	bodyLines.push(nextStepLine(insight));
	blocks.push({
		type: "section",
		text: {
			type: "mrkdwn",
			text: truncate(bodyLines.join("\n"), SLACK_SECTION_TEXT_MAX),
		},
	});
	return blocks;
}

function formatMetricValue(value: number, format?: string): string {
	const pretty = value.toLocaleString("en-US");
	switch (format) {
		case "percent":
			return `${pretty}%`;
		case "duration_ms":
			return `${pretty}ms`;
		case "duration_s":
			return `${pretty}s`;
		default:
			return pretty;
	}
}

function metricLine(metric: DigestInsight["signal"]["metric"]): string {
	const current = formatMetricValue(metric.current, metric.format);
	if (metric.previous === undefined || metric.previous === null) {
		return `${metric.label}: ${current}`;
	}
	return `${metric.label}: ${current} (was ${formatMetricValue(metric.previous, metric.format)})`;
}

export function buildThreadBlocks(insight: DigestInsight): SlackBlock[] {
	const lines = [`• ${escapeMrkdwn(metricLine(insight.signal.metric))}`];
	if (insight.outcome.rootCause?.trim()) {
		lines.push(
			`_Why:_ ${escapeMrkdwn(userVisibleCopy(insight.outcome.rootCause))}`
		);
	}
	if (insight.outcome.evidence.length) {
		lines.push(
			insight.outcome.evidence
				.map((fact) => `• ${escapeMrkdwn(userVisibleCopy(fact))}`)
				.join("\n")
		);
	}
	return [
		{
			type: "section",
			text: {
				type: "mrkdwn",
				text: truncate(lines.join("\n"), SLACK_SECTION_TEXT_MAX),
			},
		},
	];
}

interface SlackPostDependencies {
	fetcher?: typeof fetch;
	random?: () => number;
	sleep?: (milliseconds: number) => Promise<void>;
}

function rateLimitDelay(response: Response, random: () => number): number {
	const seconds = Number(response.headers.get("retry-after"));
	const requested =
		Number.isFinite(seconds) && seconds > 0
			? seconds * 1000
			: SLACK_RATE_LIMIT_FALLBACK_MS;
	return (
		Math.min(requested, SLACK_RATE_LIMIT_MAX_WAIT_MS) +
		Math.floor(random() * 250)
	);
}

export async function postToSlack(
	token: string,
	channelId: string,
	blocks: SlackBlock[],
	text: string,
	clientMessageId: string,
	dependencies: SlackPostDependencies = {}
): Promise<string> {
	const payload = buildSlackPostPayload(
		channelId,
		blocks,
		text,
		clientMessageId
	);
	const fetcher = dependencies.fetcher ?? fetch;
	const random = dependencies.random ?? Math.random;
	const sleep =
		dependencies.sleep ??
		((milliseconds: number) =>
			new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
	for (let attempt = 1; attempt <= SLACK_RATE_LIMIT_ATTEMPTS; attempt += 1) {
		const response = await fetcher(SLACK_POST_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(SLACK_POST_TIMEOUT_MS),
		});
		if (response.status === 429) {
			if (attempt === SLACK_RATE_LIMIT_ATTEMPTS) {
				throw new Error("slack chat.postMessage remained rate limited");
			}
			await sleep(rateLimitDelay(response, random));
			continue;
		}
		if (!response.ok) {
			throw new Error(
				`slack chat.postMessage failed with status ${response.status}`
			);
		}
		const body = (await response.json()) as {
			ok: boolean;
			error?: string;
			ts?: string;
		};
		if (!body.ok) {
			throw new Error(
				`slack chat.postMessage failed: ${body.error ?? "unknown_error"}`
			);
		}
		return body.ts ?? "";
	}
	throw new Error("slack chat.postMessage did not complete");
}

export function buildSlackPostPayload(
	channelId: string,
	blocks: SlackBlock[],
	text: string,
	clientMessageId: string
): Record<string, unknown> {
	return {
		blocks,
		channel: channelId,
		client_msg_id: clientMessageId,
		text,
	};
}

export async function prepareInsightSlackEffects(params: {
	insight: DigestInsight | null;
	organizationId: string;
	websiteDomain: string;
	websiteId: string;
	websiteName?: string | null;
}): Promise<InsightSlackEffectPayload[]> {
	if (!params.insight) {
		return [];
	}
	const deliveries = await resolveDeliveries(params.organizationId);
	const channelIds = [
		...new Set(
			deliveries
				.filter((item) => item.type === "slack")
				.map((item) => item.channelId)
		),
	];
	if (channelIds.length === 0) {
		return [];
	}
	const summaryBlocks = buildBlocks(
		params.websiteName,
		params.websiteDomain,
		params.insight
	);
	const blocks = [
		...summaryBlocks,
		{ type: "divider" } satisfies SlackBlock,
		{
			type: "context",
			elements: [{ type: "mrkdwn", text: "Evidence" }],
		} satisfies SlackBlock,
		...buildThreadBlocks(params.insight),
	];
	const text = buildFallbackText(params.websiteName, params.websiteDomain);
	return channelIds.map((channelId) => ({
		blocks,
		channelId,
		organizationId: params.organizationId,
		text,
		websiteId: params.websiteId,
	}));
}

export async function deliverInsightSlackEffect(
	payload: InsightSlackEffectPayload,
	clientMessageId: string
): Promise<string | null> {
	const { bindingCount, token } = await loadBoundBotToken(
		payload.organizationId,
		payload.channelId
	);
	if (bindingCount !== 1) {
		emitInsightsEvent(
			"warn",
			bindingCount === 0
				? "delivery.slack.skipped_missing_binding"
				: "delivery.slack.skipped_ambiguous_binding",
			{
				organization_id: payload.organizationId,
				website_id: payload.websiteId,
				slack_channel_id: payload.channelId,
				binding_count: bindingCount,
			}
		);
		throw new Error(
			bindingCount === 0
				? "Slack channel binding is missing"
				: "Slack channel binding is ambiguous"
		);
	}
	if (!token) {
		emitInsightsEvent("warn", "delivery.slack.skipped_missing_encryption_key", {
			organization_id: payload.organizationId,
			website_id: payload.websiteId,
			slack_channel_id: payload.channelId,
		});
		throw new Error("Slack encryption key is unavailable");
	}
	const externalId = await postToSlack(
		token,
		payload.channelId,
		payload.blocks,
		payload.text,
		clientMessageId
	);
	emitInsightsEvent("info", "delivery.slack.posted", {
		organization_id: payload.organizationId,
		website_id: payload.websiteId,
		slack_channel_id: payload.channelId,
		client_message_id: clientMessageId,
	});
	return externalId;
}
