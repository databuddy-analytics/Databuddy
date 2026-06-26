import { and, db, eq, isNull } from "@databuddy/db";
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
const MAX_DIGEST_INSIGHTS = 5;
const SLACK_HEADER_MAX = 150;
const SLACK_SECTION_TEXT_MAX = 3000;

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

interface DigestInsight {
	actions?: { label: string }[] | null;
	description: string;
	id: string;
	impactSummary?: string | null;
	sentiment: string;
	severity: string;
	suggestion: string;
	title: string;
	type: string;
}

interface SlackBlock {
	text?: { text: string; type: string };
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

function fallbackWhyItMatters(insight: DigestInsight): string {
	switch (insight.type) {
		case "referrer_change":
		case "traffic_spike":
		case "positive_trend":
			return "This is a channel or segment worth repeating while the context is fresh.";
		case "conversion_leak":
			return "Conversion analysis starts from bad data until this tracking is fixed.";
		case "funnel_regression":
			return "Funnel reports can double-count or hide the real drop-off until this is cleaned up.";
		case "error_spike":
		case "new_errors":
		case "persistent_error_hotspot":
		case "error_impact":
			return "This can distort error reporting and may block affected users.";
		case "vitals_degraded":
		case "performance":
			return "Slow or unstable pages can make the affected flow feel unreliable.";
		default:
			return "This changes which follow-up should happen next.";
	}
}

function fallbackNextAction(insight: DigestInsight): string {
	switch (insight.type) {
		case "referrer_change":
		case "traffic_spike":
		case "positive_trend":
			return "Add an annotation so future weeks have context.";
		case "conversion_leak":
			return "Fix the goal or funnel configuration.";
		case "funnel_regression":
			return "Review the funnel configuration and remove duplicate setup if present.";
		case "error_spike":
		case "new_errors":
		case "persistent_error_hotspot":
		case "error_impact":
			return "Create a fix task for the affected flow.";
		case "vitals_degraded":
		case "performance":
			return "Profile the affected route and fix the slowest step.";
		default:
			return "Review this insight in Databuddy.";
	}
}

function nextAction(insight: DigestInsight): string {
	const label = (insight.actions ?? [])
		.map((action) => action.label.trim())
		.find(Boolean);
	return label ?? fallbackNextAction(insight);
}

export function buildBlocks(
	websiteName: string | null | undefined,
	websiteDomain: string,
	insights: DigestInsight[],
	chains: ChainAssignment[]
): SlackBlock[] {
	const websiteLabel = formatWebsiteLabel(websiteName, websiteDomain);
	const blocks: SlackBlock[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: truncate(`Insights for ${websiteLabel}`, SLACK_HEADER_MAX),
			},
		},
	];
	for (const insight of insights.slice(0, MAX_DIGEST_INSIGHTS)) {
		const whyItMatters = insight.impactSummary?.trim()
			? insight.impactSummary
			: fallbackWhyItMatters(insight);
		const lines = [
			`*${escapeMrkdwn(digestLabel(insight))}*`,
			`*${escapeMrkdwn(userVisibleCopy(insight.title))}*`,
			`Evidence: ${escapeMrkdwn(userVisibleCopy(insight.description))}`,
			`Why it matters: ${escapeMrkdwn(userVisibleCopy(whyItMatters))}`,
			`Next: ${escapeMrkdwn(userVisibleCopy(nextAction(insight)))}`,
		];
		const siteCount = chainSiteCount(insight.id, chains);
		if (siteCount > 1) {
			lines.push(
				`:link: Part of a pattern affecting ${siteCount} sites in your workspace`
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
	text: string
): Promise<void> {
	const res = await fetch(SLACK_POST_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ channel: channelId, blocks, text }),
	});
	const body = (await res.json()) as { ok: boolean; error?: string };
	if (!body.ok) {
		throw new Error(
			`slack chat.postMessage failed: ${body.error ?? "unknown_error"}`
		);
	}
}

export async function deliverInsightDigests(params: {
	chains?: ChainAssignment[];
	insights: DigestInsight[];
	organizationId: string;
	websiteDomain: string;
	websiteId: string;
	websiteName?: string | null;
}): Promise<void> {
	if (params.insights.length === 0) {
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
		params.chains ?? []
	);
	const text = `Insights for ${formatWebsiteLabel(params.websiteName, params.websiteDomain)}`;
	for (const channelId of slackChannelIds) {
		try {
			await postToSlack(token, channelId, blocks, text);
			emitInsightsEvent("info", "delivery.slack.posted", {
				organization_id: params.organizationId,
				website_id: params.websiteId,
				slack_channel_id: channelId,
				insight_count: Math.min(params.insights.length, MAX_DIGEST_INSIGHTS),
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
