import { and, db, eq } from "@databuddy/db";
import dayjs from "dayjs";
import {
	insightGenerationConfigs,
	slackChannelBindings,
	slackIntegrations,
} from "@databuddy/db/schema";
import { decrypt } from "@databuddy/encryption";
import { config } from "@databuddy/env/app";
import {
	formatInvestigationNext,
	type InsightReplySlackDelivery,
	type InvestigationOutcome,
	type InvestigationSignal,
} from "@databuddy/shared/insights";
import { WebClient } from "@slack/web-api";
import { z } from "zod";
import type { WebsiteInvestigation } from "./persistence";
import { emitInsightsEvent } from "./lib/evlog-insights";

const SLACK_HEADER_MAX = 150;
const SLACK_SECTION_TEXT_MAX = 3000;

function truncate(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

type SlackInvestigation = Pick<
	WebsiteInvestigation,
	"id" | "outcome" | "signal"
>;

const slackBlockSchema = z
	.object({
		accessory: z.unknown().optional(),
		elements: z.array(z.unknown()).optional(),
		text: z
			.object({
				emoji: z.boolean().optional(),
				text: z.string(),
				type: z.string(),
			})
			.strict()
			.optional(),
		type: z.string(),
	})
	.strict();

export const insightSlackEffectPayloadSchema = z.object({
	blocks: z.array(slackBlockSchema).max(50),
	insightId: z.string().min(1).optional(),
	text: z.string().min(1),
});

type SlackBlock = z.infer<typeof slackBlockSchema>;
export type InsightSlackEffectPayload = z.infer<
	typeof insightSlackEffectPayloadSchema
>;

interface InsightSlackDeliveryContext {
	channelId: string;
	organizationId: string;
	websiteId: string;
}

type InsightSlackReplyDeliveryContext = InsightSlackDeliveryContext &
	InsightReplySlackDelivery;

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
	websiteDomain: string,
	insight: SlackInvestigation
): string {
	const website = formatWebsiteLabel(websiteName, websiteDomain);
	return escapeMrkdwn(
		userVisibleCopy(
			`${insight.signal.entity.label}: ${insight.outcome.title} · ${website}`
		)
	);
}

export function buildInsightReplyText(
	outcome: InvestigationOutcome,
	signal: InvestigationSignal
): string {
	const label =
		outcome.next.type === "act"
			? "Action"
			: outcome.next.type === "ask"
				? "Question"
				: outcome.next.type === "watch"
					? "Watching"
					: "Resolved";
	const lines = [
		`*${label} · ${escapeMrkdwn(userVisibleCopy(outcome.title))}*`,
		escapeMrkdwn(userVisibleCopy(outcome.summary)),
	];
	if (outcome.impact) {
		lines.push(`*Impact:* ${escapeMrkdwn(userVisibleCopy(outcome.impact))}`);
	}
	if (outcome.recommendation) {
		lines.push(
			`*Recommended:* ${escapeMrkdwn(userVisibleCopy(outcome.recommendation.action))}`
		);
	}
	if (outcome.next.type === "act" && outcome.rootCause) {
		lines.push(`*Why:* ${escapeMrkdwn(userVisibleCopy(outcome.rootCause))}`);
	}
	lines.push(
		`*${outcome.next.type === "resolve" ? "Result" : "Next"}:* ${escapeMrkdwn(userVisibleCopy(formatInvestigationNext(outcome, signal)))}`
	);
	return truncate(lines.join("\n"), SLACK_SECTION_TEXT_MAX);
}

function formatPeriodDay(value: string): string {
	const parsed = dayjs(value);
	return parsed.isValid() ? parsed.format("MMM D") : value;
}

export function buildBlocks(
	websiteName: string | null | undefined,
	websiteDomain: string,
	insight: SlackInvestigation
): SlackBlock[] {
	const websiteLabel = formatWebsiteLabel(websiteName, websiteDomain);
	const label = insight.outcome.next.type === "act" ? "Action" : "Question";
	const blocks: SlackBlock[] = [
		{
			type: "header",
			text: {
				type: "plain_text",
				text: truncate(`Databuddy · ${websiteLabel}`, SLACK_HEADER_MAX),
			},
		},
		{
			type: "context",
			elements: [
				{
					type: "mrkdwn",
					text: truncate(
						escapeMrkdwn(
							userVisibleCopy(
								`${label} · ${insight.signal.entity.label} · ${formatPeriodDay(insight.signal.period.current.from)} to ${formatPeriodDay(insight.signal.period.current.to)}`
							)
						),
						255
					),
				},
			],
		},
	];
	blocks.push({
		type: "section",
		text: {
			type: "mrkdwn",
			text: truncate(
				`${label === "Action" ? ":red_circle:" : ":large_yellow_circle:"} *${escapeMrkdwn(userVisibleCopy(insight.outcome.title))}*`,
				SLACK_SECTION_TEXT_MAX
			),
		},
		accessory: {
			type: "button",
			text: { type: "plain_text", text: "Open", emoji: true },
			url: `${config.urls.dashboard}/insights/${insight.id}`,
		},
	});

	const bodyLines = [
		escapeMrkdwn(userVisibleCopy(insight.outcome.summary))
			.split("\n")
			.map((line) => `>${line}`)
			.join("\n"),
	];
	if (insight.outcome.impact) {
		bodyLines.push(
			`*Impact:* ${escapeMrkdwn(userVisibleCopy(insight.outcome.impact))}`
		);
	}
	bodyLines.push(
		`*Next:* ${escapeMrkdwn(userVisibleCopy(formatInvestigationNext(insight.outcome, insight.signal)))}`
	);
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

export function buildThreadBlocks(insight: SlackInvestigation): SlackBlock[] {
	const metric = insight.signal.metric;
	const current = formatMetricValue(metric.current, metric.format);
	const lines = [
		`• ${escapeMrkdwn(
			metric.previous === undefined || metric.previous === null
				? `${metric.label}: ${current}`
				: `${metric.label}: ${current} (was ${formatMetricValue(metric.previous, metric.format)})`
		)}`,
	];
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

export async function prepareInsightSlackEffects(params: {
	insight: WebsiteInvestigation | null;
	organizationId: string;
}) {
	const { insight } = params;
	if (!insight) {
		return [];
	}
	const [orgConfig] = await db
		.select({ deliveries: insightGenerationConfigs.deliveries })
		.from(insightGenerationConfigs)
		.where(eq(insightGenerationConfigs.organizationId, params.organizationId))
		.limit(1);
	const deliveries = orgConfig?.deliveries ?? [];
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
		insight.websiteName,
		insight.websiteDomain,
		insight
	);
	const blocks = [
		...summaryBlocks,
		{ type: "divider" } satisfies SlackBlock,
		{
			type: "context",
			elements: [{ type: "mrkdwn", text: "Evidence" }],
		} satisfies SlackBlock,
		...buildThreadBlocks(insight),
	];
	const text = buildFallbackText(
		insight.websiteName,
		insight.websiteDomain,
		insight
	);
	return channelIds.map((channelId) => ({
		effectKey: channelId,
		payload: {
			blocks,
			insightId: insight.id,
			text,
		} satisfies InsightSlackEffectPayload,
	}));
}

export async function deliverInsightSlackEffect(
	payload: InsightSlackEffectPayload,
	context: InsightSlackDeliveryContext,
	clientMessageId: string,
	threadTs?: string
): Promise<string | null> {
	const integrations = await db
		.select({ ciphertext: slackIntegrations.botTokenCiphertext })
		.from(slackChannelBindings)
		.innerJoin(
			slackIntegrations,
			and(
				eq(slackChannelBindings.integrationId, slackIntegrations.id),
				eq(slackIntegrations.organizationId, context.organizationId),
				eq(slackIntegrations.status, "active")
			)
		)
		.where(eq(slackChannelBindings.slackChannelId, context.channelId))
		.limit(2);
	const bindingCount = integrations.length;
	const key = process.env.DATABUDDY_ENCRYPTION_KEY;
	const token =
		bindingCount === 1 && key ? decrypt(integrations[0].ciphertext, key) : null;
	if (bindingCount !== 1) {
		emitInsightsEvent(
			"warn",
			bindingCount === 0
				? "delivery.slack.skipped_missing_binding"
				: "delivery.slack.skipped_ambiguous_binding",
			{
				organization_id: context.organizationId,
				website_id: context.websiteId,
				slack_channel_id: context.channelId,
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
			organization_id: context.organizationId,
			website_id: context.websiteId,
			slack_channel_id: context.channelId,
		});
		throw new Error("Slack encryption key is unavailable");
	}
	const result = await new WebClient(token, {
		retryConfig: { retries: 2, minTimeout: 1000, maxTimeout: 5000 },
		timeout: 10_000,
	}).apiCall("chat.postMessage", {
		...(payload.blocks.length ? { blocks: payload.blocks } : {}),
		channel: context.channelId,
		client_msg_id: clientMessageId,
		text: payload.text,
		...(threadTs ? { thread_ts: threadTs } : {}),
	});
	emitInsightsEvent("info", "delivery.slack.posted", {
		organization_id: context.organizationId,
		website_id: context.websiteId,
		slack_channel_id: context.channelId,
		client_message_id: clientMessageId,
		slack_thread_ts: threadTs,
	});
	const timestamp = (result as { ts?: unknown }).ts;
	return typeof timestamp === "string" ? timestamp : null;
}

export async function deliverInsightSlackReply(params: {
	clientMessageId: string;
	context: InsightSlackReplyDeliveryContext;
	result: {
		outcome: InvestigationOutcome;
		signal: InvestigationSignal;
	} | null;
}): Promise<string | null> {
	return await deliverInsightSlackEffect(
		{
			blocks: [],
			text: params.result
				? buildInsightReplyText(params.result.outcome, params.result.signal)
				: "I couldn't finish this investigation. Try replying again, or open it from the original message.",
		},
		params.context,
		params.clientMessageId,
		params.context.threadTs
	);
}
