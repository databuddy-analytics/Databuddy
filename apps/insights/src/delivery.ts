import { and, db, eq, isNull } from "@databuddy/db";
import dayjs from "dayjs";
import {
	type InsightDelivery,
	insightGenerationConfigs,
	slackIntegrations,
} from "@databuddy/db/schema";
import { decrypt } from "@databuddy/encryption";
import { env } from "@databuddy/env/insights";
import type { ChainAssignment } from "./chain-detection";
import { captureInsightsError, emitInsightsEvent } from "./lib/evlog-insights";

const SLACK_POST_URL = "https://slack.com/api/chat.postMessage";
const MAX_DIGEST_INSIGHTS = 3;
const SLACK_HEADER_MAX = 150;
const SLACK_SECTION_TEXT_MAX = 3000;

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

interface DigestMetric {
	current: number;
	format?: "number" | "percent" | "duration_ms" | "duration_s";
	label: string;
	previous?: number | null;
}

interface DigestEvidence {
	description: string;
}

interface DigestInsight {
	actions?: { label: string }[] | null;
	currentPeriodFrom?: string | null;
	currentPeriodTo?: string | null;
	description: string;
	evidence?: DigestEvidence[] | null;
	id: string;
	impactSummary?: string | null;
	metrics?: DigestMetric[] | null;
	rootCause?: string | null;
	sentiment?: string | null;
	severity: string;
	suggestion: string;
	title: string;
	type?: string | null;
}

interface SlackBlock {
	accessory?: unknown;
	elements?: unknown[];
	text?: { emoji?: boolean; text: string; type: string };
	type: string;
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
		`Insights for ${formatWebsiteLabel(websiteName, websiteDomain)}`
	);
}

async function resolveDeliveries(
	organizationId: string,
	websiteId: string
): Promise<InsightDelivery[]> {
	const [websiteConfig] = await db
		.select({ deliveries: insightGenerationConfigs.deliveries })
		.from(insightGenerationConfigs)
		.where(
			and(
				eq(insightGenerationConfigs.organizationId, organizationId),
				eq(insightGenerationConfigs.websiteId, websiteId)
			)
		)
		.limit(1);
	if (websiteConfig) {
		return websiteConfig.deliveries;
	}

	const [orgConfig] = await db
		.select({ deliveries: insightGenerationConfigs.deliveries })
		.from(insightGenerationConfigs)
		.where(
			and(
				eq(insightGenerationConfigs.organizationId, organizationId),
				isNull(insightGenerationConfigs.websiteId)
			)
		)
		.limit(1);
	return orgConfig?.deliveries ?? [];
}

async function loadBotToken(organizationId: string): Promise<string | null> {
	const key = env.DATABUDDY_ENCRYPTION_KEY;
	if (!key) {
		return null;
	}
	const [integration] = await db
		.select({ ciphertext: slackIntegrations.botTokenCiphertext })
		.from(slackIntegrations)
		.where(
			and(
				eq(slackIntegrations.organizationId, organizationId),
				eq(slackIntegrations.status, "active")
			)
		)
		.limit(1);
	if (!integration) {
		return null;
	}
	return decrypt(integration.ciphertext, key);
}

function chainSiteCount(insightId: string, chains: ChainAssignment[]): number {
	const chain = chains.find((c) => c.insightIds.includes(insightId));
	return chain ? new Set(chain.websiteIds).size : 0;
}

function digestLabel(insight: DigestInsight): string {
	switch (insight.type) {
		case "referrer_change":
		case "traffic_spike":
		case "positive_trend":
			return insight.sentiment === "positive"
				? "Opportunity · Acquisition"
				: "Review · Traffic";
		case "conversion_leak":
			return "Fix · Goal tracking";
		case "funnel_regression":
			return "Cleanup · Funnel config";
		case "error_spike":
		case "new_errors":
		case "persistent_error_hotspot":
		case "error_impact":
			return "Fix · Error volume";
		case "vitals_degraded":
		case "performance":
			return "Fix · Performance";
		case "performance_improved":
		case "reliability_improved":
			return "Improvement · Reliability";
		case "quality_shift":
		case "segment_regression":
			return "Review · Data quality";
		default:
			return insight.severity === "info"
				? "Review · Signal"
				: "Fix · Priority signal";
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
	return `${base}/insights#insight-${insightId}`;
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
	escalations: DigestInsight[]
): string {
	const escalationCount = escalations.length;
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
	const withPeriod = [...insights, ...escalations].find(
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
	chains: ChainAssignment[],
	escalations: DigestInsight[] = []
): SlackBlock[] {
	const websiteLabel = formatWebsiteLabel(websiteName, websiteDomain);
	const visible = insights.slice(0, MAX_DIGEST_INSIGHTS);
	const blocks: SlackBlock[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: truncate(`Insights for ${websiteLabel}`, SLACK_HEADER_MAX),
			},
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: truncate(summaryChip(visible, escalations), 255),
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

		const siteCount = chainSiteCount(insight.id, chains);
		const contextParts = [escapeMrkdwn(label)];
		if (siteCount > 1) {
			contextParts.push(`part of a pattern across ${siteCount} sites`);
		}
		blocks.push({
			type: "context",
			elements: [
				{ type: "mrkdwn", text: truncate(contextParts.join(" · "), 255) },
			],
		});

		if (index < visible.length - 1) {
			blocks.push({ type: "divider" });
		}
	}

	if (escalations.length > 0) {
		if (visible.length > 0) {
			blocks.push({ type: "divider" });
		}
		for (const escalation of escalations) {
			blocks.push({
				type: "section",
				text: {
					type: "mrkdwn",
					text: truncate(
						`:small_red_triangle_up: *${escapeMrkdwn(userVisibleCopy(escalation.title))}*\n>Still open and now worse than when first reported.`,
						SLACK_SECTION_TEXT_MAX
					),
				},
				accessory: {
					type: "button",
					text: { type: "plain_text", text: "Open", emoji: true },
					url: insightUrl(escalation.id),
				},
			});
		}
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

function metricLine(metric: DigestMetric): string {
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
	escalations: DigestInsight[] = []
): SlackBlock[] {
	const all = [
		...insights.slice(0, MAX_DIGEST_INSIGHTS),
		...escalations,
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

async function postToSlack(
	token: string,
	channelId: string,
	blocks: SlackBlock[],
	text: string,
	threadTs?: string
): Promise<string> {
	const payload: Record<string, unknown> = { channel: channelId, blocks, text };
	if (threadTs) {
		payload.thread_ts = threadTs;
	}
	const res = await fetch(SLACK_POST_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(payload),
	});
	const body = (await res.json()) as {
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

export async function deliverInsightDigests(params: {
	chains?: ChainAssignment[];
	escalations?: DigestInsight[];
	insights: DigestInsight[];
	organizationId: string;
	websiteDomain: string;
	websiteId: string;
	websiteName?: string | null;
}): Promise<void> {
	const escalations = params.escalations ?? [];
	if (params.insights.length === 0 && escalations.length === 0) {
		return;
	}

	const deliveries = await resolveDeliveries(
		params.organizationId,
		params.websiteId
	);
	const slackChannelIds = [
		...new Set(
			deliveries.filter((d) => d.type === "slack").map((d) => d.channelId)
		),
	];
	if (slackChannelIds.length === 0) {
		return;
	}

	const token = await loadBotToken(params.organizationId);
	if (!token) {
		emitInsightsEvent("warn", "delivery.slack.skipped_no_integration", {
			organization_id: params.organizationId,
			website_id: params.websiteId,
			delivery_count: slackChannelIds.length,
		});
		return;
	}

	const blocks = buildBlocks(
		params.websiteName,
		params.websiteDomain,
		params.insights,
		params.chains ?? [],
		escalations
	);
	const threadBlocks = buildThreadBlocks(params.insights, escalations);
	const text = buildFallbackText(params.websiteName, params.websiteDomain);
	for (const channelId of slackChannelIds) {
		try {
			const parentTs = await postToSlack(token, channelId, blocks, text);
			if (threadBlocks.length > 0 && parentTs) {
				await postToSlack(
					token,
					channelId,
					threadBlocks,
					"Supporting numbers and evidence",
					parentTs
				);
			}
			emitInsightsEvent("info", "delivery.slack.posted", {
				organization_id: params.organizationId,
				website_id: params.websiteId,
				slack_channel_id: channelId,
				insight_count: Math.min(params.insights.length, MAX_DIGEST_INSIGHTS),
				threaded_detail: threadBlocks.length > 0,
			});
		} catch (error) {
			captureInsightsError(error, "delivery.slack.failed", {
				organization_id: params.organizationId,
				website_id: params.websiteId,
				slack_channel_id: channelId,
			});
		}
	}
}
