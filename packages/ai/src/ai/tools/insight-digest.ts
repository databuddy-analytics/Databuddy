import {
	getNextInsightRunAt,
	isValidCron,
	isValidTimezone,
} from "@databuddy/rpc";
import { tool } from "ai";
import { z } from "zod";
import type { AppContext } from "../config/context";
import {
	computeReschedulePatch,
	computeRescheduleProposal,
} from "./digest-reschedule";
import {
	type DigestConfigSummary,
	summarizeDigestConfig,
} from "./digest-summary";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Insight Digest Tools");

const SLACK_CHANNEL_ID_RE = /^[CGD][A-Z0-9]{8,}$/i;

const CONFIRM_INSTRUCTION =
	"Wait for the user to explicitly confirm before calling this tool again with confirmed=true.";

const digestFrequencySchema = z.enum(["hourly", "daily", "weekly", "custom"]);

const manageDigestInputSchema = z.object({
	action: z
		.enum(["status", "preview", "route", "unroute", "reschedule", "test"])
		.describe(
			"status: read current routing and schedule (safe, no confirmation). preview: show the most recent past digest run for this scope (no mutation). route: start posting digests to a Slack channel. unroute: stop posting to a Slack channel. reschedule: change when the digest runs (cron expression, timezone, or cadence). test: trigger a one-off end-to-end run right now — investigates, generates insights, and posts the digest to whichever Slack channels are currently configured. Bypasses cooldown. Costs LLM tokens and DOES post to Slack."
		),
	channelId: z
		.string()
		.min(1)
		.max(120)
		.optional()
		.describe(
			"Slack channel ID like 'C082WC4PPGS'. Required for route and unroute. For the current channel use slack_channel_id from context. Not a channel name (do not pass '#general')."
		),
	frequency: digestFrequencySchema
		.optional()
		.describe(
			"Cadence for a new route (hourly, daily, weekly) or reschedule (also accepts custom, which requires cron). Ignored for status, preview, unroute."
		),
	cron: z
		.string()
		.min(1)
		.max(120)
		.optional()
		.describe(
			"Five-field cron expression evaluated in the config timezone: 'minute hour day-of-month month day-of-week'. Example: '0 8 * * 5' for every Friday at 08:00 local time. Used by reschedule. When cron is provided, frequency is set to 'custom' automatically. Ignored for all other actions."
		),
	timezone: z
		.string()
		.min(1)
		.max(80)
		.optional()
		.describe(
			"IANA timezone name like 'Europe/Berlin', 'America/New_York', or 'UTC'. Anchors weekly/daily/cron schedules. Used by reschedule only. Ignored for all other actions."
		),
	websiteId: z
		.string()
		.optional()
		.describe("Scope to one website. Omit to apply to the whole organization."),
	confirmed: z
		.boolean()
		.describe(
			"Required for route, unroute, reschedule, and test. The user's INITIAL message asking for the change is NOT confirmation — it is the request. Always call with confirmed=false first (the tool returns a preview block describing the proposed change), then wait for the user to reply in a separate message before calling again with confirmed=true. Even confident phrasings like 'drop a weekly digest here', 'kill the digest', or 'change it to Friday 8am' must still start with confirmed=false. Ignored for status and preview."
		),
});

type DigestAction = z.infer<typeof manageDigestInputSchema>["action"];
type DigestInput = z.infer<typeof manageDigestInputSchema>;

interface ScopeInput {
	organizationId: string;
	websiteId?: string;
}

interface ActionContext {
	context: AppContext;
	scope: string;
	scopeInput: ScopeInput;
	websiteId: string | undefined;
}

function fail<C extends string>(code: C, message: string) {
	return { success: false, code, message } as const;
}

function scopeKind(websiteId: string | undefined): "organization" | "website" {
	return websiteId ? "website" : "organization";
}

function scopeLabel(websiteId: string | undefined): string {
	return websiteId ? "this website" : "this organization";
}

function channelMention(channelId: string): string {
	return `<#${channelId}>`;
}

function describeChannels(channels: string[]): string {
	if (channels.length === 0) {
		return "no Slack channels";
	}
	if (channels.length === 1) {
		return channelMention(channels[0] as string);
	}
	return `${channels.length} Slack channels (${channels.map(channelMention).join(", ")})`;
}

function validateChannelId(
	channelId: string | undefined,
	action: DigestAction
) {
	if (!channelId) {
		return fail(
			"MISSING_CHANNEL_ID",
			`channelId is required to ${action} a digest. Provide a Slack channel ID like C082WC4PPGS, or use slack_channel_id from context for the current channel.`
		);
	}
	if (!SLACK_CHANNEL_ID_RE.test(channelId)) {
		return fail(
			"INVALID_CHANNEL_ID",
			`"${channelId}" doesn't look like a Slack channel ID. Channel IDs start with C, G, or D followed by uppercase letters and digits (for example C082WC4PPGS). For the current channel use slack_channel_id from context. Refusing to ${action}.`
		);
	}
	return null;
}

function rpcFailure(action: DigestAction, error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: `Failed to ${action} insight digest.`;
	return fail("RPC_FAILED", message);
}

async function readDigestSummary(
	context: AppContext,
	scopeInput: ScopeInput
): Promise<DigestConfigSummary> {
	const config = await callRPCProcedure(
		"insightGeneration",
		"getConfig",
		scopeInput,
		context
	);
	return summarizeDigestConfig(config);
}

interface RawRun {
	createdAt?: string | Date | null;
	id?: string;
	status?: string;
	summary?: string | null;
	websiteId?: string | null;
}

interface RawRunItem {
	body?: string | null;
	severity?: string | null;
	title?: string | null;
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function asIsoDate(value: unknown): string | null {
	if (value instanceof Date) {
		return value.toISOString();
	}
	return asString(value);
}

async function handleStatus({
	context,
	scope,
	scopeInput,
	websiteId,
}: ActionContext) {
	try {
		const summary = await readDigestSummary(context, scopeInput);
		const channels = summary.channels.map(channelMention);
		const scheduleSuffix = `(timezone ${summary.timezone}${summary.cron ? `, cron \`${summary.cron}\`` : ""})`;
		const message =
			summary.channels.length > 0
				? `${scope} sends digests to ${describeChannels(summary.channels)} on a ${summary.frequency} cadence ${scheduleSuffix}.`
				: `No Slack digest delivery is configured for ${scope}. Investigations still run on a ${summary.frequency} cadence at the ${summary.scope} level ${scheduleSuffix}.`;

		return {
			success: true,
			action: "status" as const,
			current: {
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				cadence: summary.frequency,
				channels,
				channelIds: summary.channels,
				source: summary.scope,
				cron: summary.cron,
				timezone: summary.timezone,
				nextRunAt: summary.nextRunAt,
			},
			message,
		};
	} catch (error) {
		logger.error("Failed to read insight digest config", { websiteId, error });
		return rpcFailure("status", error);
	}
}

async function handlePreview({ context, scope, websiteId }: ActionContext) {
	try {
		const listResult = (await callRPCProcedure(
			"insightGeneration",
			"listRuns",
			{ limit: 1, organizationId: context.organizationId },
			context
		)) as { runs?: RawRun[] };

		const latest = listResult.runs?.[0];
		if (!latest?.id) {
			return {
				success: true,
				action: "preview" as const,
				preview: { runs: 0 },
				message: `No past digest runs to preview for ${scope} yet. Once the first digest runs you can call action=preview to see it.`,
			};
		}

		const runDetail = (await callRPCProcedure(
			"insightGeneration",
			"getRun",
			{ runId: latest.id },
			context
		)) as { items?: RawRunItem[]; run?: RawRun };

		const items = (runDetail.items ?? []).map((item) => ({
			title: asString(item.title) ?? "Untitled insight",
			body: asString(item.body),
			severity: asString(item.severity),
		}));

		return {
			success: true,
			action: "preview" as const,
			preview: {
				runId: latest.id,
				runAt: asIsoDate(latest.createdAt),
				status: asString(latest.status),
				summary: asString(latest.summary),
				items,
				runs: 1,
			},
			message:
				items.length > 0
					? `Most recent digest for ${scope} had ${items.length} insight${items.length === 1 ? "" : "s"}.`
					: `Most recent digest for ${scope} produced no insights.`,
		};
	} catch (error) {
		logger.error("Failed to preview insight digest", { websiteId, error });
		return rpcFailure("preview", error);
	}
}

async function handleReschedule(
	{ context, scope, scopeInput, websiteId }: ActionContext,
	{ cron, frequency, timezone, confirmed }: DigestInput
) {
	if (cron === undefined && timezone === undefined && frequency === undefined) {
		return fail(
			"RESCHEDULE_NOOP",
			"reschedule needs at least one of cron, timezone, or frequency. Pass the field(s) you want to change."
		);
	}
	if (cron !== undefined && !isValidCron(cron)) {
		return fail(
			"INVALID_CRON",
			`"${cron}" is not a valid five-field cron expression. Expected 'minute hour day-of-month month day-of-week' with numbers, comma lists, '*', or '*/N' steps in each field, e.g. '0 8 * * 5' for every Friday at 08:00.`
		);
	}
	if (timezone !== undefined && !isValidTimezone(timezone)) {
		return fail(
			"INVALID_TIMEZONE",
			`"${timezone}" is not a recognized IANA timezone. Pass a name like 'Europe/Berlin', 'America/New_York', or 'UTC'.`
		);
	}

	let existing: DigestConfigSummary;
	try {
		existing = await readDigestSummary(context, scopeInput);
	} catch (error) {
		logger.error("Failed to read digest config for reschedule", {
			websiteId,
			error,
		});
		return rpcFailure("reschedule", error);
	}

	if (frequency === "custom" && cron === undefined && !existing.cron) {
		return fail(
			"CRON_REQUIRED",
			"Setting frequency=custom requires a cron expression. Pass cron alongside frequency, or leave the existing cron in place."
		);
	}

	const proposal = computeRescheduleProposal(existing, {
		cron,
		frequency,
		timezone,
	});
	if (proposal.changes.length === 0) {
		return fail(
			"RESCHEDULE_NOOP",
			`Nothing to change — the proposed schedule for ${scope} matches the current one.`
		);
	}

	const proposedNextRunAt =
		getNextInsightRunAt(
			{
				cron: proposal.cron,
				enabled: true,
				frequency: proposal.frequency,
				timezone: proposal.timezone,
			},
			new Date()
		)?.toISOString() ?? null;

	if (!confirmed) {
		return {
			preview: true,
			confirmationRequired: true,
			proposed: {
				action: "reschedule" as const,
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				cadence: proposal.frequency,
				cadenceWas: existing.frequency,
				cron: proposal.cron,
				cronWas: existing.cron,
				timezone: proposal.timezone,
				timezoneWas: existing.timezone,
				nextRunAt: proposedNextRunAt,
				nextRunAtWas: existing.nextRunAt,
			},
			message: `Reschedule digest for ${scope}: ${proposal.changes.join(", ")}. ${proposedNextRunAt ? `Next run would be ${proposedNextRunAt}.` : "Next run cannot be computed for the proposed schedule — double-check cron/frequency."} Reply to confirm.`,
			instruction: CONFIRM_INSTRUCTION,
		};
	}

	try {
		const config = await callRPCProcedure(
			"insightGeneration",
			"upsertConfig",
			{
				...scopeInput,
				...computeReschedulePatch({ cron, frequency, timezone }),
			},
			context
		);
		const summary = summarizeDigestConfig(config);
		return {
			success: true,
			action: "reschedule" as const,
			applied: {
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				cadence: summary.frequency,
				cadenceWas: existing.frequency,
				cadenceChanged: existing.frequency !== summary.frequency,
				cron: summary.cron,
				cronWas: existing.cron,
				cronChanged: existing.cron !== summary.cron,
				timezone: summary.timezone,
				timezoneWas: existing.timezone,
				timezoneChanged: existing.timezone !== summary.timezone,
				nextRunAt: summary.nextRunAt,
			},
			message: `Rescheduled digest for ${scope}. Next run: ${summary.nextRunAt ?? "not scheduled"}.`,
		};
	} catch (error) {
		logger.error("Failed to reschedule insight digest", {
			websiteId,
			cron,
			timezone,
			frequency,
			error,
		});
		return rpcFailure("reschedule", error);
	}
}

async function handleTest(
	{ context, scope, scopeInput, websiteId }: ActionContext,
	{ confirmed }: DigestInput
) {
	let existing: DigestConfigSummary;
	try {
		existing = await readDigestSummary(context, scopeInput);
	} catch (error) {
		logger.error("Failed to read digest config for test run", {
			websiteId,
			error,
		});
		return rpcFailure("test", error);
	}

	const channels = existing.channels.map(channelMention);
	const deliveryDescription =
		channels.length > 0
			? `post to ${describeChannels(existing.channels)}`
			: "store insights without posting (no Slack channels are routed)";

	if (!confirmed) {
		return {
			preview: true,
			confirmationRequired: true,
			proposed: {
				action: "test" as const,
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				websiteId: websiteId ?? null,
				channels,
				channelIds: existing.channels,
				cadence: existing.frequency,
			},
			message: `Trigger a one-off test digest run for ${scope}. The pipeline will run the full investigation and ${deliveryDescription}. This costs LLM tokens and bypasses cooldown. Reply to confirm.`,
			instruction: CONFIRM_INSTRUCTION,
		};
	}

	try {
		const result = (await callRPCProcedure(
			"insightGeneration",
			"triggerRun",
			{
				force: true,
				organizationId: context.organizationId,
				reason: "manual" as const,
				websiteIds: websiteId ? [websiteId] : undefined,
			},
			context
		)) as {
			queuedItems: number;
			reusedRun?: boolean;
			runId?: string;
			status: string;
		};

		const message = result.reusedRun
			? `A digest run is already in flight for this organization (runId ${result.runId ?? "unknown"}). No new run was queued; that one will ${deliveryDescription} when it finishes. Use action=preview after it completes.`
			: result.status === "skipped"
				? `Test run produced no queueable websites — nothing to investigate for ${scope}.`
				: `Queued test digest run ${result.runId ?? "(no id)"} with ${result.queuedItems} website${result.queuedItems === 1 ? "" : "s"} in flight. The pipeline will ${deliveryDescription} when it finishes. Use action=preview to inspect the results once the run completes.`;

		return {
			success: true,
			action: "test" as const,
			applied: {
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				websiteId: websiteId ?? null,
				runId: result.runId ?? null,
				queuedItems: result.queuedItems,
				runStatus: result.status,
				reusedRun: result.reusedRun ?? false,
				targetScope: websiteId
					? `1 website (${websiteId})`
					: "all websites in this organization",
				channels,
				channelIds: existing.channels,
			},
			message,
		};
	} catch (error) {
		logger.error("Failed to trigger test insight digest run", {
			websiteId,
			error,
		});
		return rpcFailure("test", error);
	}
}

async function handleRoute(
	{ context, scope, scopeInput, websiteId }: ActionContext,
	{ channelId, frequency, confirmed }: DigestInput
) {
	if (frequency === "custom") {
		return fail(
			"INVALID_FREQUENCY_FOR_ROUTE",
			"frequency=custom is only valid for action=reschedule. For route, pick hourly, daily, or weekly; switch to a custom cron via action=reschedule afterwards."
		);
	}
	const channelError = validateChannelId(channelId, "route");
	if (channelError) {
		return channelError;
	}
	const id = channelId as string;

	let cadenceWas: string | null = null;
	try {
		cadenceWas = (await readDigestSummary(context, scopeInput)).frequency;
	} catch (error) {
		logger.error("Failed to read digest config for cadence diff", {
			websiteId,
			error,
		});
	}

	if (!confirmed) {
		const cadenceLine =
			frequency && cadenceWas && cadenceWas !== frequency
				? ` Cadence change: ${cadenceWas} -> ${frequency}.`
				: "";
		return {
			preview: true,
			confirmationRequired: true,
			proposed: {
				action: "route" as const,
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				channel: channelMention(id),
				channelId: id,
				frequency: frequency ?? null,
				cadenceWas,
			},
			message: `Route insight digests for ${scope} to ${channelMention(id)}${frequency ? ` on a ${frequency} cadence` : ""}.${cadenceLine} Reply to confirm.`,
			instruction: CONFIRM_INSTRUCTION,
		};
	}

	try {
		const config = await callRPCProcedure(
			"insightGeneration",
			"addSlackDelivery",
			{ ...scopeInput, channelId: id, frequency },
			context
		);
		const summary = summarizeDigestConfig(config);
		return {
			success: true,
			action: "route" as const,
			applied: {
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				channel: channelMention(id),
				channelId: id,
				cadence: summary.frequency,
				cadenceWas,
				cadenceChanged: cadenceWas !== null && cadenceWas !== summary.frequency,
				nextRunAt: summary.nextRunAt,
			},
			message: `Routed insight digests to ${channelMention(id)} on a ${summary.frequency} cadence.`,
		};
	} catch (error) {
		logger.error("Failed to route insight digest", {
			websiteId,
			channelId: id,
			error,
		});
		return rpcFailure("route", error);
	}
}

async function handleUnroute(
	{ context, scope, scopeInput, websiteId }: ActionContext,
	{ channelId, confirmed }: DigestInput
) {
	const channelError = validateChannelId(channelId, "unroute");
	if (channelError) {
		return channelError;
	}
	const id = channelId as string;

	if (!confirmed) {
		return {
			preview: true,
			confirmationRequired: true,
			proposed: {
				action: "unroute" as const,
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				channel: channelMention(id),
				channelId: id,
			},
			message: `Stop routing insight digests for ${scope} to ${channelMention(id)}. Reply to confirm.`,
			instruction: CONFIRM_INSTRUCTION,
		};
	}

	try {
		const config = await callRPCProcedure(
			"insightGeneration",
			"removeSlackDelivery",
			{ ...scopeInput, channelId: id },
			context
		);
		const summary = summarizeDigestConfig(config);
		return {
			success: true,
			action: "unroute" as const,
			applied: {
				scope: scopeKind(websiteId),
				scopeLabel: scope,
				channel: channelMention(id),
				channelId: id,
				cadence: summary.frequency,
				channelsRemaining: summary.channels.map(channelMention),
				nextRunAt: summary.nextRunAt,
			},
			message: `Stopped routing insight digests to ${channelMention(id)}.`,
		};
	} catch (error) {
		logger.error("Failed to unroute insight digest", {
			websiteId,
			channelId: id,
			error,
		});
		return rpcFailure("unroute", error);
	}
}

export function createInsightDigestTools() {
	const manageInsightDigestTool = tool({
		description:
			"Inspect, preview, change, OR trigger a test run of the analytics insight digest. Actions: status (read routing+schedule), preview (last past run), route, unroute, reschedule (cron/timezone/cadence), test (one-off end-to-end run that posts to currently-routed channels and costs LLM tokens). The schedule IS configurable via reschedule. CONFIRMATION CONTRACT (route/unroute/reschedule/test): the user's first ask is the REQUEST, not the confirmation. Always call confirmed=false first to get a preview block, restate it, then call confirmed=true only after the user replies in a separate turn — even when phrasing is confident ('drop a digest here', 'kill the digest', 'switch to Friday 8am'). RESPONSE CONTRACT: results carry a structured `current` / `proposed` / `applied` / `preview` block. Quote every value (channels, cadence, cron, timezone, nextRunAt, runId) verbatim from that block; channels arrive in <#CHANNELID> form, paste them as-is. Don't paraphrase, don't invent fields, don't re-pitch what the digest contains. If a field is null, say so plainly.",
		inputSchema: manageDigestInputSchema,
		execute: async (args, options) => {
			const context = getAppContext(options);
			if (!context.organizationId) {
				return fail(
					"NO_ORGANIZATION",
					`Cannot ${args.action} a digest without an organization in context. Identify the organization first.`
				);
			}

			const actionContext: ActionContext = {
				context,
				scope: scopeLabel(args.websiteId),
				scopeInput: {
					organizationId: context.organizationId,
					websiteId: args.websiteId ?? undefined,
				},
				websiteId: args.websiteId,
			};

			switch (args.action) {
				case "status":
					return await handleStatus(actionContext);
				case "preview":
					return await handlePreview(actionContext);
				case "reschedule":
					return await handleReschedule(actionContext, args);
				case "test":
					return await handleTest(actionContext, args);
				case "route":
					return await handleRoute(actionContext, args);
				case "unroute":
					return await handleUnroute(actionContext, args);
				default:
					return fail("UNKNOWN_ACTION", "Unsupported digest action.");
			}
		},
	});

	return { manage_insight_digest: manageInsightDigestTool } as const;
}
