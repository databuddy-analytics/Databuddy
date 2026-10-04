import { isValidTimezone } from "@databuddy/rpc/insight-schedule";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import {
	historyInsightSchema,
	insightBriefItemSchema,
	insightTimelineItemSchema,
	insightTimelineReplySchema,
} from "@databuddy/shared/insights";
import { type ToolExecutionOptions, tool } from "ai";
import { z } from "zod";
import type { AppContext } from "../config/context";
import { callRPCProcedure, getAppContext } from "./utils";

const frequencySchema = z.enum(["off", "daily", "weekly"]);

const inputSchema = z.object({
	action: z
		.enum(["status", "configure", "run"])
		.describe(
			"status reads automatic analysis settings; configure changes its schedule, timezone, or Slack delivery; run starts an investigation now"
		),
	frequency: frequencySchema
		.optional()
		.describe("Automatic analysis schedule: off, daily, or weekly"),
	timezone: z
		.string()
		.trim()
		.min(1)
		.max(64)
		.refine(isValidTimezone, "Invalid IANA timezone")
		.optional(),
	channelId: z
		.string()
		.trim()
		.max(120)
		.regex(
			/^[CG][A-Z0-9]{8,}$/,
			"Slack channels must start with C or G; direct messages are not supported"
		)
		.optional()
		.describe("Slack channel ID, or slack_channel_id for the current channel"),
	channelAction: z
		.enum(["add", "remove"])
		.optional()
		.describe("Add or remove channelId from automatic Slack delivery"),
	confirmed: z
		.boolean()
		.default(false)
		.describe(
			"For configure and run, set false first and true only after the user confirms"
		),
});

type Input = z.input<typeof inputSchema>;

export const investigationActionSchema = z
	.object({
		action: z
			.enum(["brief", "list", "get", "reply"])
			.describe(
				"Read published insights, list cases, get one case and its timeline, or reply to it"
			),
		body: z
			.string()
			.trim()
			.min(1)
			.max(2000)
			.optional()
			.describe("Human context; required for reply"),
		investigationId: z
			.string()
			.min(1)
			.max(256)
			.optional()
			.describe("Required for get and reply"),
		limit: z.number().int().min(1).max(100).default(20),
		offset: z.number().int().min(0).default(0),
		replyId: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.refine((value) => !value.includes(":"), {
				message: "Reply ids cannot contain colons",
			})
			.optional()
			.describe(
				"Stable colon-free idempotency key; required for reply and reused on retries"
			),
		websiteId: z
			.string()
			.min(1)
			.optional()
			.describe("Optional website scope for brief or list"),
	})
	.strict();

const readOnlyInvestigationActionSchema = investigationActionSchema
	.omit({ body: true, replyId: true })
	.extend({
		action: investigationActionSchema.shape.action
			.exclude(["reply"])
			.describe(
				"Read published insights, list cases, or get one case and its timeline"
			),
		investigationId:
			investigationActionSchema.shape.investigationId.describe(
				"Required for get"
			),
	});

type InvestigationAction = z.input<typeof investigationActionSchema>;
type RpcCaller = typeof callRPCProcedure;

const dryRunReceiptSchema = z.object({
	dryRun: z.literal(true),
	message: z.string(),
	mutationBlocked: z.literal(true),
	success: z.literal(false),
});

export async function runInvestigationAction(
	rawInput: InvestigationAction,
	context: AppContext,
	abortSignal?: AbortSignal,
	callRpc: RpcCaller = callRPCProcedure
) {
	const input = investigationActionSchema.parse(rawInput);
	if (input.action === "brief" || input.action === "list") {
		if (!context.organizationId) {
			throw new Error("Select an organization first");
		}
		const websiteId =
			input.websiteId ?? context.defaultWebsiteId ?? context.websiteId;
		const page = {
			limit: input.limit,
			offset: input.offset,
			organizationId: context.organizationId,
			...(websiteId ? { websiteId } : {}),
		};
		if (input.action === "brief") {
			const result = z
				.object({
					hasMore: z.boolean(),
					insights: z.array(insightBriefItemSchema),
				})
				.parse(await callRpc("insights", "brief", page, context, abortSignal));
			return {
				action: "brief" as const,
				hasMore: result.hasMore,
				insights: result.insights,
			};
		}
		const result = z
			.object({
				hasMore: z.boolean(),
				insights: z.array(historyInsightSchema),
			})
			.parse(await callRpc("insights", "history", page, context, abortSignal));
		return {
			action: "list" as const,
			hasMore: result.hasMore,
			investigations: result.insights,
		};
	}

	if (input.action === "get") {
		if (!input.investigationId) {
			throw new Error("investigationId is required for get");
		}
		const result = z
			.object({
				canReply: z.boolean(),
				insight: historyInsightSchema.nullable(),
				timeline: z.array(insightTimelineItemSchema),
			})
			.parse(
				await callRpc(
					"insights",
					"getById",
					{ insightId: input.investigationId },
					context,
					abortSignal
				)
			);
		return {
			action: "get" as const,
			canReply: result.canReply,
			investigation: result.insight,
			timeline: result.timeline.map((item) => {
				if (item.kind !== "investigation") {
					return item;
				}
				const { contextSnapshot: _snapshot, ...outcome } = item.outcome;
				return { ...item, outcome };
			}),
		};
	}

	if (!(input.body && input.investigationId && input.replyId)) {
		throw new Error(
			"body, investigationId, and replyId are required for reply"
		);
	}
	const response = await callRpc(
		"insights",
		"reply",
		{
			body: input.body,
			insightId: input.investigationId,
			intent: "clarification",
			replyId: input.replyId,
		},
		context,
		abortSignal
	);
	const receipt = dryRunReceiptSchema.safeParse(response);
	if (receipt.success) {
		return { action: "reply" as const, ...receipt.data };
	}
	const result = z
		.object({ reply: insightTimelineReplySchema })
		.parse(response);
	return {
		action: "reply" as const,
		message: `Reply accepted with status ${result.reply.status}. This included clarification uses saved evidence, without new measurements. Use investigations with action=get to read its answer in the updated timeline. Start a new question or fresh analysis explicitly in the dashboard; it uses an included investigation, then costs $${INVESTIGATION_USAGE.priceUsd} after the allowance.`,
		reply: result.reply,
	};
}

function validateConfiguration(input: Input): void {
	const hasChannelChange = input.channelAction !== undefined;
	if ((input.channelId !== undefined) !== hasChannelChange) {
		throw new Error("channelId and channelAction must be provided together");
	}
	if (!(input.frequency || input.timezone || hasChannelChange)) {
		throw new Error(
			"Configure requires a frequency, timezone, or Slack channel change"
		);
	}
	if (hasChannelChange && input.timezone) {
		throw new Error("Change timezone in a separate configure call");
	}
	if (input.channelAction === "remove" && input.frequency) {
		throw new Error("Change the schedule in a separate configure call");
	}
	if (input.channelAction === "add" && input.frequency === "off") {
		throw new Error("Slack delivery requires daily or weekly analysis");
	}
}

function executeInvestigations(
	input: InvestigationAction,
	options: ToolExecutionOptions
) {
	return runInvestigationAction(
		input,
		getAppContext(options),
		options.abortSignal
	);
}

function executeConfigureInvestigations(
	input: Input,
	options: ToolExecutionOptions
) {
	const context = getAppContext(options);
	const organizationId = context.organizationId;
	if (!organizationId) {
		throw new Error("Select an organization first");
	}

	if (input.action === "status") {
		return callRPCProcedure(
			"insightGeneration",
			"getConfig",
			{ organizationId },
			context
		);
	}

	if (input.action === "configure") {
		validateConfiguration(input);
	}
	const websiteId = context.defaultWebsiteId ?? context.websiteId;
	if (!input.confirmed) {
		const startsAnalysis =
			input.action === "run" ||
			input.frequency === "daily" ||
			input.frequency === "weekly" ||
			input.channelAction === "add";
		return {
			confirmationRequired: true,
			scope:
				input.action === "run" && websiteId
					? `Website ${websiteId}`
					: "All websites in this organization",
			billing: startsAnalysis
				? `For organizations on fixed-price investigation billing: ${INVESTIGATION_USAGE.description} Each manual or scheduled run may investigate several signals and use multiple investigations. Additional usage is billed monthly when overage is enabled. Changing settings does not itself charge for an investigation. AI credits pay for Databunny chat and are not drawn down by investigations.`
				: undefined,
		};
	}

	if (input.action === "run") {
		return callRPCProcedure(
			"insightGeneration",
			"triggerRun",
			{
				organizationId,
				websiteIds: websiteId ? [websiteId] : undefined,
			},
			context
		);
	}

	if (input.channelAction === "add" && input.channelId) {
		return callRPCProcedure(
			"insightGeneration",
			"addSlackDelivery",
			{
				organizationId,
				channelId: input.channelId,
				frequency: input.frequency === "off" ? undefined : input.frequency,
			},
			context
		);
	}

	if (input.channelAction === "remove" && input.channelId) {
		return callRPCProcedure(
			"insightGeneration",
			"removeSlackDelivery",
			{ organizationId, channelId: input.channelId },
			context
		);
	}

	return callRPCProcedure(
		"insightGeneration",
		"upsertConfig",
		{
			organizationId,
			...(input.frequency
				? {
						enabled: input.frequency !== "off",
						...(input.frequency === "off"
							? {}
							: { frequency: input.frequency }),
					}
				: {}),
			...(input.timezone ? { timezone: input.timezone } : {}),
		},
		context
	);
}

export function createInvestigationTools({
	readOnly = false,
}: {
	readOnly?: boolean;
} = {}) {
	if (readOnly) {
		return {
			investigations: tool({
				description:
					"Read existing intelligence. brief returns published insights with their next steps; list/get reads durable cases. Preserve returned advice instead of adding more.",
				inputSchema: readOnlyInvestigationActionSchema,
				execute: executeInvestigations,
			}),
			configure_investigations: tool({
				description:
					"Read automatic investigations. status returns the organization config: Off/Daily/Weekly schedule, timezone, and Slack delivery.",
				inputSchema: z.object({ action: z.enum(["status"]) }),
				execute: executeConfigureInvestigations,
			}),
		} as const;
	}
	return {
		investigations: tool({
			description:
				"Read existing intelligence. brief returns published insights with their next steps; list/get/reply handles durable cases. Preserve returned advice instead of adding more.",
			inputSchema: investigationActionSchema,
			needsApproval: ({ action }) => action === "reply",
			execute: executeInvestigations,
		}),
		configure_investigations: tool({
			description:
				"Read or change automatic investigations. status returns the organization config; configure sets Off/Daily/Weekly, timezone, or Slack delivery; run investigates the selected website now, or every website when none is selected. Configure and run require a separate confirmation turn. Show the preview's scope and billing disclosure before asking for confirmation. A run may investigate several signals; its price is not a single investigation's price.",
			inputSchema,
			needsApproval: ({ confirmed }) => confirmed === true,
			execute: executeConfigureInvestigations,
		}),
	} as const;
}
