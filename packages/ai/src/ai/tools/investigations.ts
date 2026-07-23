import { isValidTimezone } from "@databuddy/rpc/insight-schedule";
import {
	historyInsightSchema,
	insightTimelineItemSchema,
	insightTimelineReplySchema,
} from "@databuddy/shared/insights";
import { tool } from "ai";
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

type Input = z.infer<typeof inputSchema>;

export const investigationActionSchema = z
	.object({
		action: z
			.enum(["list", "get", "reply"])
			.describe("List cases, get one case and its timeline, or reply to it"),
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
			.describe("Optional website scope for list"),
	})
	.strict();

type InvestigationAction = z.input<typeof investigationActionSchema>;
type RpcCaller = (
	routerName: string,
	method: string,
	input: unknown,
	context: AppContext,
	abortSignal?: AbortSignal
) => Promise<unknown>;

function isDryRunReceipt(value: unknown): value is {
	dryRun: true;
	message: string;
	mutationBlocked: true;
	success: false;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"dryRun" in value &&
		value.dryRun === true &&
		"mutationBlocked" in value &&
		value.mutationBlocked === true &&
		"message" in value &&
		typeof value.message === "string"
	);
}

export async function runInvestigationAction(
	rawInput: InvestigationAction,
	context: AppContext,
	abortSignal?: AbortSignal,
	callRpc: RpcCaller = callRPCProcedure
) {
	const input = investigationActionSchema.parse(rawInput);
	if (input.action === "list") {
		if (!context.organizationId) {
			throw new Error("Select an organization first");
		}
		const websiteId =
			input.websiteId ??
			context.defaultWebsiteId ??
			context.websiteId ??
			undefined;
		const result = z
			.object({
				hasMore: z.boolean(),
				insights: z.array(historyInsightSchema),
			})
			.parse(
				await callRpc(
					"insights",
					"history",
					{
						limit: input.limit,
						offset: input.offset,
						organizationId: context.organizationId,
						...(websiteId ? { websiteId } : {}),
					},
					context,
					abortSignal
				)
			);
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
			timeline: result.timeline,
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
			replyId: input.replyId,
		},
		context,
		abortSignal
	);
	if (isDryRunReceipt(response)) {
		return { action: "reply" as const, ...response };
	}
	const result = z
		.object({ reply: insightTimelineReplySchema })
		.parse(response);
	return {
		action: "reply" as const,
		message: `Reply accepted with status ${result.reply.status}. The investigation continues asynchronously; use investigations with action=get to read the updated timeline.`,
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

export function createInvestigationTools() {
	return {
		investigations: tool({
			description:
				"Work with durable investigations. list returns current cases, get returns one case and its timeline, and reply adds human context then continues that same investigation asynchronously. For reply, use a stable replyId and reuse it on retries.",
			inputSchema: investigationActionSchema,
			execute: (input, options) =>
				runInvestigationAction(
					input,
					getAppContext(options),
					options.abortSignal
				),
		}),
		configure_investigations: tool({
			description:
				"Read or change automatic investigations. status returns the organization config; configure sets Off/Daily/Weekly, timezone, or Slack delivery; run investigates the selected website now, or every website when none is selected. Configure and run require a separate confirmation turn.",
			inputSchema,
			execute: (input, options) => {
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
				if (!input.confirmed) {
					return { confirmationRequired: true };
				}

				if (input.action === "run") {
					const websiteId = context.defaultWebsiteId ?? context.websiteId;
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
							frequency:
								input.frequency === "off" ? undefined : input.frequency,
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
			},
		}),
	} as const;
}
