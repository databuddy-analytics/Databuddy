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
import type { GeneratedWebsiteInsight } from "./persistence";
import { emitInsightsEvent } from "./lib/evlog-insights";

const SLACK_POST_URL = "https://slack.com/api/chat.postMessage";
const SLACK_POST_TIMEOUT_MS = 10_000;
const SLACK_RATE_LIMIT_ATTEMPTS = 3;
const SLACK_RATE_LIMIT_FALLBACK_MS = 1000;
const SLACK_RATE_LIMIT_MAX_WAIT_MS = 5000;
const MAX_DIGEST_INSIGHTS = 3;
const MAX_ONGOING_LINES = 5;
const SLACK_HEADER_MAX = 150;
const SLACK_SECTION_TEXT_MAX = 3000;
const SLACK_BLOCK_MAX = 50;

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

type DigestInsight = Pick<
	GeneratedWebsiteInsight,
	"description" | "id" | "severity" | "title"
> &
	Partial<
		Pick<
			GeneratedWebsiteInsight,
			| "evidence"
			| "impactSummary"
			| "metrics"
			| "remediationKind"
			| "rootCause"
			| "sentiment"
			| "type"
		>
	> & {
		currentPeriodFrom?: string | null;
		currentPeriodTo?: string | null;
	};

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
	const verifiedRepair = Boolean(insight.remediationKind);
	switch (insight.type) {
		case "referrer_change":
		case "traffic_spike":
		case "positive_trend":
			return insight.sentiment === "positive"
				? "Opportunity · Acquisition"
				: "Review · Traffic";
		case "conversion_leak":
			return verifiedRepair ? "Fix · Goal tracking" : "Review · Conversion";
		case "funnel_regression":
			return verifiedRepair ? "Fix · Funnel" : "Review · Conversion";
		case "error_spike":
		case "new_errors":
		case "persistent_error_hotspot":
		case "error_impact":
			return verifiedRepair ? "Fix · Error" : "Review · Error";
		case "vitals_degraded":
		case "performance":
			return verifiedRepair ? "Fix · Performance" : "Review · Performance";
		case "performance_improved":
		case "reliability_improved":
			return "Improvement · Reliability";
		case "quality_shift":
		case "segment_regression":
			return "Review · Data quality";
		default:
			return verifiedRepair ? "Fix" : "Review";
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

function formatPeriodDay(value: string): string {
	const parsed = dayjs(value);
	return parsed.isValid() ? parsed.format("MMM D") : value;
}

function summaryChip(
	insights: DigestInsight[],
	escalations: DigestInsight[],
	persistent: DigestInsight[] = []
): string {
	const escalationCount = escalations.length;
	const ongoingCount = persistent.length;
	let fixes = 0;
	let reviews = 0;
	let wins = 0;
	for (const insight of insights) {
		const label = digestLabel(insight);
		if (label.startsWith("Fix")) {
			fixes += 1;
		} else if (
			label.startsWith("Opportunity") ||
			label.startsWith("Improvement")
		) {
			wins += 1;
		} else {
			reviews += 1;
		}
	}
	const parts: string[] = [];
	if (fixes > 0) {
		parts.push(`${fixes} ${fixes === 1 ? "fix" : "fixes"}`);
	}
	if (reviews > 0) {
		parts.push(`${reviews} ${reviews === 1 ? "review" : "reviews"}`);
	}
	if (wins > 0) {
		parts.push(`${wins} ${wins === 1 ? "win" : "wins"}`);
	}
	if (escalationCount > 0) {
		parts.push(
			`${escalationCount} ${escalationCount === 1 ? "escalation" : "escalations"}`
		);
	}
	if (ongoingCount > 0) {
		parts.push(`${ongoingCount} still open`);
	}
	const withPeriod = [...insights, ...escalations, ...persistent].find(
		(insight) => insight.currentPeriodFrom && insight.currentPeriodTo
	);
	if (withPeriod?.currentPeriodFrom && withPeriod.currentPeriodTo) {
		parts.push(
			`week of ${formatPeriodDay(withPeriod.currentPeriodFrom)} to ${formatPeriodDay(withPeriod.currentPeriodTo)}`
		);
	}
	return parts.join(" · ");
}

export function buildBlocks(
	websiteName: string | null | undefined,
	websiteDomain: string,
	insights: DigestInsight[],
	escalations: DigestInsight[] = [],
	persistent: DigestInsight[] = []
): SlackBlock[] {
	const websiteLabel = formatWebsiteLabel(websiteName, websiteDomain);
	const visible = insights.slice(0, MAX_DIGEST_INSIGHTS);
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
					text: truncate(summaryChip(visible, escalations, persistent), 255),
				},
			],
		},
	];
	for (const [index, insight] of visible.entries()) {
		const label = digestLabel(insight);
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: truncate(
					`${digestEmoji(label)} *${escapeMrkdwn(userVisibleCopy(insight.title))}*`,
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
			quoted(escapeMrkdwn(userVisibleCopy(insight.description))),
		];
		const impact = insight.impactSummary?.trim();
		if (impact) {
			bodyLines.push(escapeMrkdwn(userVisibleCopy(impact)));
		}
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: truncate(bodyLines.join("\n"), SLACK_SECTION_TEXT_MAX),
			},
		});

		blocks.push({
			type: "context",
			elements: [{ type: "mrkdwn", text: truncate(escapeMrkdwn(label), 255) }],
		});

		if (index < visible.length - 1) {
			blocks.push({ type: "divider" });
		}
	}

	const ongoing = [
		...escalations.map((insight) => ({
			insight,
			emoji: ":small_red_triangle_up:",
			note: "Still open and now worse than when first reported.",
		})),
		...persistent.map((insight) => ({
			insight,
			emoji: ":radio_button:",
			note: "Still open, no change since it was first flagged.",
		})),
	].slice(0, MAX_ONGOING_LINES);
	if (ongoing.length > 0 && visible.length > 0) {
		blocks.push({ type: "divider" });
	}
	for (const { insight, emoji, note } of ongoing) {
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: truncate(
					`${emoji} *${escapeMrkdwn(userVisibleCopy(insight.title))}*\n>${note}`,
					SLACK_SECTION_TEXT_MAX
				),
			},
			accessory: {
				type: "button",
				text: { type: "plain_text", text: "Open", emoji: true },
				url: insightUrl(insight.id),
			},
		});
	}
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

function metricLine(
	metric: NonNullable<DigestInsight["metrics"]>[number]
): string {
	const current = formatMetricValue(metric.current, metric.format);
	if (metric.previous === undefined || metric.previous === null) {
		return `${metric.label}: ${current}`;
	}
	return `${metric.label}: ${current} (was ${formatMetricValue(metric.previous, metric.format)})`;
}

function hasThreadDetail(insight: DigestInsight): boolean {
	return Boolean(
		insight.metrics?.length ||
			insight.evidence?.length ||
			insight.rootCause?.trim()
	);
}

export function buildThreadBlocks(
	insights: DigestInsight[],
	escalations: DigestInsight[] = [],
	persistent: DigestInsight[] = []
): SlackBlock[] {
	const all = [
		...insights.slice(0, MAX_DIGEST_INSIGHTS),
		...escalations,
		...persistent,
	].filter(hasThreadDetail);
	const blocks: SlackBlock[] = [];
	for (const insight of all) {
		const lines = [`*${escapeMrkdwn(userVisibleCopy(insight.title))}*`];
		if (insight.metrics?.length) {
			lines.push(
				insight.metrics
					.map((metric) => `• ${escapeMrkdwn(metricLine(metric))}`)
					.join("\n")
			);
		}
		if (insight.rootCause?.trim()) {
			lines.push(`_Why:_ ${escapeMrkdwn(userVisibleCopy(insight.rootCause))}`);
		}
		if (insight.evidence?.length) {
			lines.push(
				insight.evidence
					.map((fact) => `• ${escapeMrkdwn(userVisibleCopy(fact.description))}`)
					.join("\n")
			);
		}
		blocks.push({
			type: "section",
			text: {
				type: "mrkdwn",
				text: truncate(lines.join("\n"), SLACK_SECTION_TEXT_MAX),
			},
		});
	}
	return blocks;
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
	escalations?: DigestInsight[];
	insights: DigestInsight[];
	organizationId: string;
	persistent?: DigestInsight[];
	websiteDomain: string;
	websiteId: string;
	websiteName?: string | null;
}): Promise<InsightSlackEffectPayload[]> {
	const escalations = params.escalations ?? [];
	const persistent = params.persistent ?? [];
	if (
		params.insights.length === 0 &&
		escalations.length === 0 &&
		persistent.length === 0
	) {
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
		params.insights,
		escalations,
		persistent
	);
	const detailBlocks = buildThreadBlocks(
		params.insights,
		escalations,
		persistent
	);
	const blocks = [
		...summaryBlocks,
		...(detailBlocks.length > 0
			? [
					{ type: "divider" } satisfies SlackBlock,
					{
						type: "context",
						elements: [
							{ type: "mrkdwn", text: "Supporting numbers and evidence" },
						],
					} satisfies SlackBlock,
					...detailBlocks,
				]
			: []),
	].slice(0, SLACK_BLOCK_MAX);
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
