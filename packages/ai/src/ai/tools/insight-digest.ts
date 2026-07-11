import { getNextInsightRunAt, isValidTimezone } from "@databuddy/rpc";
import { tool } from "ai";
import { z } from "zod";
import type { AppContext } from "../config/context";
import {
	type DigestConfigSummary,
	summarizeDigestConfig,
} from "./digest-summary";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Insight Digest Tools");

const SLACK_CHANNEL_ID_RE = /^[CG][A-Z0-9]{8,}$/;

const CONFIRM_INSTRUCTION =
	"Wait for the user to explicitly confirm before calling this tool again with confirmed=true.";

const digestScheduleSchema = z.enum(["off", "daily", "weekly"]);

const manageDigestInputSchema = z.object({
	action: z
		.enum(["status", "route", "unroute", "reschedule", "test"])
		.describe(
			"status: read the organization's analysis schedule and Slack destinations. route: send findings to a Slack channel. unroute: stop sending findings to a Slack channel. reschedule: set automatic analysis to Off, Daily, or Weekly, or change its timezone. test: run one analysis now for the selected website, or every website when none is selected. It uses the organization's Databunny allowance, saves findings, and sends them to configured Slack channels."
		),
	channelId: z
		.string()
		.min(1)
		.max(120)
		.regex(
			SLACK_CHANNEL_ID_RE,
			"Slack channels must start with C or G; direct messages are not supported."
		)
		.optional()
		.describe(
			"Slack public/private channel ID starting with C or G, like 'C082WC4PPGS'. Required for route and unroute. Direct messages (D...) are not supported. For the current channel use slack_channel_id from context. Not a channel name (do not pass '#general')."
		),
	frequency: digestScheduleSchema
		.optional()
		.describe(
			"Organization schedule for reschedule: off, daily, or weekly. Route accepts daily or weekly. Ignored for status, unroute, and test."
		),
	timezone: z
		.string()
		.min(1)
		.max(80)
		.optional()
		.describe(
			"IANA timezone name like 'Europe/Berlin', 'America/New_York', or 'UTC'. Anchors daily and weekly schedules. Used by reschedule only."
		),
	confirmed: z
		.boolean()
		.default(false)
		.describe(
			"Set true only after the user confirms a route, unroute, reschedule, or one-off analysis in a separate message. The initial request is not confirmation. Ignored for status."
		),
});

type DigestAction = z.infer<typeof manageDigestInputSchema>["action"];
type DigestInput = z.infer<typeof manageDigestInputSchema>;

interface ActionContext {
	context: AppContext;
	organizationId: string;
	selectedWebsiteId?: string;
}

function fail<C extends string>(code: C, message: string) {
	return { success: false, code, message } as const;
}

function channelMention(channelId: string): string {
	return `<#${channelId}>`;
}

function describeChannels(channels: string[]): string {
	if (channels.length === 0) {
		return "no Slack channels";
	}
	const [only] = channels;
	if (channels.length === 1 && only) {
		return channelMention(only);
	}
	return `${channels.length} Slack channels (${channels.map(channelMention).join(", ")})`;
}

function validatedChannelId(
	channelId: string | undefined,
	action: DigestAction
) {
	if (!channelId) {
		return fail(
			"MISSING_CHANNEL_ID",
			`channelId is required to ${action} Slack delivery. Provide a Slack channel ID like C082WC4PPGS, or use slack_channel_id from context for the current channel.`
		);
	}
	if (!SLACK_CHANNEL_ID_RE.test(channelId)) {
		return fail(
			"INVALID_CHANNEL_ID",
			`"${channelId}" isn't a supported Slack channel. Channel IDs start with C or G (for example C082WC4PPGS); direct messages are not supported. For the current channel use slack_channel_id from context. Refusing to ${action}.`
		);
	}
	return channelId;
}

function rpcFailure(action: DigestAction, error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: `Failed to ${action} automatic analysis.`;
	return fail("RPC_FAILED", message);
}

async function readDigestSummary(
	context: AppContext,
	organizationId: string
): Promise<DigestConfigSummary> {
	const config = await callRPCProcedure(
		"insightGeneration",
		"getConfig",
		{ organizationId },
		context
	);
	return summarizeDigestConfig(config);
}

async function handleStatus({ context, organizationId }: ActionContext) {
	try {
		const summary = await readDigestSummary(context, organizationId);
		const channels = summary.channels.map(channelMention);
		const schedule = summary.enabled ? summary.frequency : "off";
		const scheduleLabel =
			schedule === "off" ? "Off" : schedule === "daily" ? "Daily" : "Weekly";
		let message = "Automatic analysis: Off.";
		if (summary.enabled && summary.channels.length > 0) {
			message = `Automatic analysis: ${scheduleLabel} (${summary.timezone}). Findings go to ${describeChannels(summary.channels)}.`;
		} else if (summary.enabled) {
			message = `Automatic analysis: ${scheduleLabel} (${summary.timezone}). Slack delivery: None.`;
		}

		return {
			success: true,
			action: "status" as const,
			current: {
				scope: "organization" as const,
				schedule,
				channels,
				channelIds: summary.channels,
				source: summary.source,
				timezone: summary.timezone,
				nextRunAt: summary.nextRunAt,
			},
			message,
		};
	} catch (error) {
		logger.error("Failed to read automatic analysis config", {
			organizationId,
			error,
		});
		return rpcFailure("status", error);
	}
}

async function handleReschedule(
	{ context, organizationId }: ActionContext,
	{ frequency, timezone, confirmed }: DigestInput
) {
	if (timezone === undefined && frequency === undefined) {
		return fail(
			"RESCHEDULE_NOOP",
			"reschedule needs frequency (off, daily, or weekly) or timezone."
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
		existing = await readDigestSummary(context, organizationId);
	} catch (error) {
		logger.error("Failed to read digest config for reschedule", {
			organizationId,
			error,
		});
		return rpcFailure("reschedule", error);
	}

	const previousSchedule = existing.enabled ? existing.frequency : "off";
	const proposedEnabled =
		frequency === undefined ? existing.enabled : frequency !== "off";
	const proposedFrequency =
		frequency === "daily" || frequency === "weekly"
			? frequency
			: existing.frequency;
	const proposedTimezone = timezone ?? existing.timezone;
	const proposedSchedule = proposedEnabled ? proposedFrequency : "off";
	const changes: string[] = [];
	if (proposedSchedule !== previousSchedule) {
		changes.push(`schedule ${previousSchedule} -> ${proposedSchedule}`);
	}
	if (proposedTimezone !== existing.timezone) {
		changes.push(`timezone ${existing.timezone} -> ${proposedTimezone}`);
	}
	if (changes.length === 0) {
		return fail(
			"RESCHEDULE_NOOP",
			"Nothing to change — the proposed organization schedule matches the current one."
		);
	}

	const proposedNextRunAt =
		getNextInsightRunAt(
			{
				enabled: proposedEnabled,
				frequency: proposedFrequency,
				timezone: proposedTimezone,
			},
			new Date()
		)?.toISOString() ?? null;

	if (!confirmed) {
		return {
			preview: true,
			confirmationRequired: true,
			proposed: {
				action: "reschedule" as const,
				scope: "organization" as const,
				schedule: proposedSchedule,
				scheduleWas: previousSchedule,
				timezone: proposedTimezone,
				timezoneWas: existing.timezone,
				nextRunAt: proposedNextRunAt,
				nextRunAtWas: existing.nextRunAt,
			},
			message: `Change automatic analysis: ${changes.join(", ")}. ${proposedNextRunAt ? `Next run would be ${proposedNextRunAt}.` : "No next run while automatic analysis is off."} Reply to confirm.`,
			instruction: CONFIRM_INSTRUCTION,
		};
	}

	try {
		const config = await callRPCProcedure(
			"insightGeneration",
			"upsertConfig",
			{
				organizationId,
				...(frequency === undefined
					? {}
					: {
							enabled: frequency !== "off",
							...(frequency === "off" ? {} : { frequency }),
						}),
				...(timezone === undefined ? {} : { timezone }),
			},
			context
		);
		const summary = summarizeDigestConfig(config);
		return {
			success: true,
			action: "reschedule" as const,
			applied: {
				scope: "organization" as const,
				schedule: summary.enabled ? summary.frequency : "off",
				scheduleWas: previousSchedule,
				timezone: summary.timezone,
				timezoneWas: existing.timezone,
				timezoneChanged: existing.timezone !== summary.timezone,
				nextRunAt: summary.nextRunAt,
			},
			message: `Automatic analysis updated. Next run: ${summary.nextRunAt ?? "not scheduled"}.`,
		};
	} catch (error) {
		logger.error("Failed to reschedule insight digest", {
			organizationId,
			timezone,
			frequency,
			error,
		});
		return rpcFailure("reschedule", error);
	}
}

async function handleTest(
	{ context, organizationId, selectedWebsiteId }: ActionContext,
	{ confirmed }: DigestInput
) {
	let existing: DigestConfigSummary;
	try {
		existing = await readDigestSummary(context, organizationId);
	} catch (error) {
		logger.error("Failed to read digest config for test run", {
			organizationId,
			selectedWebsiteId,
			error,
		});
		return rpcFailure("test", error);
	}

	const channels = existing.channels.map(channelMention);
	const deliveryDescription =
		channels.length > 0
			? `send findings to ${describeChannels(existing.channels)}`
			: "save findings on the Findings page without Slack delivery";

	if (!confirmed) {
		return {
			preview: true,
			confirmationRequired: true,
			proposed: {
				action: "test" as const,
				scope: "organization" as const,
				targetWebsiteId: selectedWebsiteId ?? null,
				channels,
				channelIds: existing.channels,
				schedule: existing.enabled ? existing.frequency : "off",
			},
			message: `Run analysis now for ${selectedWebsiteId ? "the selected website" : "every website in this organization"}? This uses the organization's Databunny allowance and will ${deliveryDescription}. Reply to confirm.`,
			instruction: CONFIRM_INSTRUCTION,
		};
	}

	try {
		const result = (await callRPCProcedure(
			"insightGeneration",
			"triggerRun",
			{
				organizationId,
				websiteIds: selectedWebsiteId ? [selectedWebsiteId] : undefined,
			},
			context
		)) as {
			queuedItems: number;
			reusedRun?: boolean;
			runId?: string;
			status: string;
		};

		const message = result.reusedRun
			? `Analysis is already running for this organization (runId ${result.runId ?? "unknown"}). No new run was queued; it will ${deliveryDescription} when it finishes.`
			: result.status === "skipped"
				? "No websites were available for analysis."
				: `Queued analysis ${result.runId ?? "(no id)"} for ${result.queuedItems} website${result.queuedItems === 1 ? "" : "s"}. It will ${deliveryDescription} when it finishes.`;

		return {
			success: true,
			action: "test" as const,
			applied: {
				scope: "organization" as const,
				targetWebsiteId: selectedWebsiteId ?? null,
				runId: result.runId ?? null,
				queuedItems: result.queuedItems,
				runStatus: result.status,
				reusedRun: result.reusedRun ?? false,
				targetScope: selectedWebsiteId
					? `1 website (${selectedWebsiteId})`
					: "all websites in this organization",
				channels,
				channelIds: existing.channels,
			},
			message,
		};
	} catch (error) {
		logger.error("Failed to trigger test insight digest run", {
			organizationId,
			selectedWebsiteId,
			error,
		});
		return rpcFailure("test", error);
	}
}

async function handleRoute(
	{ context, organizationId }: ActionContext,
	{ channelId, frequency, confirmed }: DigestInput
) {
	if (frequency === "off") {
		return fail(
			"INVALID_FREQUENCY_FOR_ROUTE",
			"Slack delivery requires daily or weekly analysis. Use reschedule with frequency=off to turn automatic analysis off."
		);
	}
	const id = validatedChannelId(channelId, "route");
	if (typeof id !== "string") {
		return id;
	}

	let existing: DigestConfigSummary;
	try {
		existing = await readDigestSummary(context, organizationId);
	} catch (error) {
		logger.error("Failed to read digest config before routing", {
			organizationId,
			error,
		});
		return rpcFailure("route", error);
	}
	const scheduleWas = existing.enabled ? existing.frequency : "off";
	const schedule = frequency ?? existing.frequency;

	if (!confirmed) {
		const scheduleLine =
			scheduleWas === schedule
				? ""
				: ` Schedule change: ${scheduleWas === "off" ? "Off" : scheduleWas === "daily" ? "Daily" : "Weekly"} -> ${schedule === "daily" ? "Daily" : "Weekly"}.`;
		return {
			preview: true,
			confirmationRequired: true,
			proposed: {
				action: "route" as const,
				scope: "organization" as const,
				channel: channelMention(id),
				channelId: id,
				schedule,
				scheduleWas,
			},
			message: `Send findings to ${channelMention(id)} after each ${schedule} analysis?${scheduleLine} Reply to confirm.`,
			instruction: CONFIRM_INSTRUCTION,
		};
	}

	try {
		const config = await callRPCProcedure(
			"insightGeneration",
			"addSlackDelivery",
			{ organizationId, channelId: id, frequency },
			context
		);
		const summary = summarizeDigestConfig(config);
		return {
			success: true,
			action: "route" as const,
			applied: {
				scope: "organization" as const,
				channel: channelMention(id),
				channelId: id,
				schedule: summary.frequency,
				scheduleWas,
				nextRunAt: summary.nextRunAt,
			},
			message: `Findings will go to ${channelMention(id)} after each ${summary.frequency} analysis.`,
		};
	} catch (error) {
		logger.error("Failed to route insight digest", {
			organizationId,
			channelId: id,
			error,
		});
		return rpcFailure("route", error);
	}
}

async function handleUnroute(
	{ context, organizationId }: ActionContext,
	{ channelId, confirmed }: DigestInput
) {
	const id = validatedChannelId(channelId, "unroute");
	if (typeof id !== "string") {
		return id;
	}

	if (!confirmed) {
		return {
			preview: true,
			confirmationRequired: true,
			proposed: {
				action: "unroute" as const,
				scope: "organization" as const,
				channel: channelMention(id),
				channelId: id,
			},
			message: `Stop sending findings to ${channelMention(id)}? Reply to confirm.`,
			instruction: CONFIRM_INSTRUCTION,
		};
	}

	try {
		const config = await callRPCProcedure(
			"insightGeneration",
			"removeSlackDelivery",
			{ organizationId, channelId: id },
			context
		);
		const summary = summarizeDigestConfig(config);
		return {
			success: true,
			action: "unroute" as const,
			applied: {
				scope: "organization" as const,
				channel: channelMention(id),
				channelId: id,
				schedule: summary.enabled ? summary.frequency : "off",
				channelsRemaining: summary.channels.map(channelMention),
				nextRunAt: summary.nextRunAt,
			},
			message: `Findings will no longer go to ${channelMention(id)}.`,
		};
	} catch (error) {
		logger.error("Failed to unroute insight digest", {
			organizationId,
			channelId: id,
			error,
		});
		return rpcFailure("unroute", error);
	}
}

export function createInsightDigestTools() {
	const manageInsightDigestTool = tool({
		description:
			"Inspect or change automatic analysis and Slack delivery. Actions: status, route, unroute, reschedule (off/daily/weekly plus timezone), and test (run one analysis now). Scheduling and delivery are organization-wide; a one-off run targets the selected website, or every website when none is selected. CONFIRMATION CONTRACT (route/unroute/reschedule/test): the user's first ask is the request, not confirmation. Always call confirmed=false first, then call confirmed=true only after the user confirms in a separate turn. RESPONSE CONTRACT: quote channels, schedule, timezone, nextRunAt, and runId verbatim from the structured result. Channels arrive in <#CHANNELID> form. If a field is null, say so plainly.",
		inputSchema: manageDigestInputSchema,
		execute: async (args, options) => {
			const context = getAppContext(options);
			if (!context.organizationId) {
				return fail(
					"NO_ORGANIZATION",
					`Cannot ${args.action} automatic analysis without an organization in context. Identify the organization first.`
				);
			}

			const actionContext: ActionContext = {
				context,
				organizationId: context.organizationId,
				selectedWebsiteId:
					context.defaultWebsiteId ?? context.websiteId ?? undefined,
			};

			switch (args.action) {
				case "status":
					return await handleStatus(actionContext);
				case "reschedule":
					return await handleReschedule(actionContext, args);
				case "test":
					return await handleTest(actionContext, args);
				case "route":
					return await handleRoute(actionContext, args);
				case "unroute":
					return await handleUnroute(actionContext, args);
				default:
					return fail("UNKNOWN_ACTION", "Unsupported analysis action.");
			}
		},
	});

	return { manage_insight_digest: manageInsightDigestTool } as const;
}
