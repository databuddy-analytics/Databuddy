import { tool } from "ai";
import {
	flagFormSchema,
	flagFormShape,
	userRuleSchema,
	variantSchema,
} from "@databuddy/shared/flags";
import { z } from "zod";
import { McpToolError } from "../mcp/define-tool";
import { FLAG_IDENTITY_FIELDS, pickFields } from "../mcp/tool-contracts";
import { createUserTargetRule, flagRolloutBySchema } from "./flag-rules";
import {
	callRPCProcedure,
	createToolLogger,
	getAppContext,
	omitUndefined,
} from "./utils";

const logger = createToolLogger("Flags Tools");

export const flagConfigFields = {
	name: z.string().min(1).max(100).optional().describe("Flag name."),
	description: z.string().optional().describe("What the flag controls."),
	type: flagFormShape.type
		.optional()
		.describe(
			"boolean turns on or off, rollout serves a percentage, multivariant serves variants."
		),
	status: flagFormShape.status
		.optional()
		.describe(
			"Requesting active saves inactive while any dependency is inactive."
		),
	defaultValue: z
		.boolean()
		.optional()
		.describe("Value served when no rule matches."),
	payload: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("JSON returned with the flag."),
	persistAcrossAuth: z
		.boolean()
		.optional()
		.describe("true keeps a visitor's value after they sign in."),
	rolloutPercentage: z
		.number()
		.min(0)
		.max(100)
		.optional()
		.describe("Percent of users who get the flag, 0 to 100."),
	rolloutBy: flagRolloutBySchema.optional(),
	rules: z.array(userRuleSchema).optional(),
	variants: z
		.array(variantSchema)
		.optional()
		.describe("Variants for a multivariant flag."),
	dependencies: z
		.array(z.string())
		.optional()
		.describe("Keys of flags that must be active for this flag to be active."),
	environment: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Environment name, such as production; null serves SDKs that set no environment."
		),
	targetGroupIds: z
		.array(z.string())
		.optional()
		.describe("IDs of target groups to attach."),
};

export const userTargetingFields = {
	users: z
		.array(z.string().trim().min(1))
		.min(1)
		.max(500)
		.describe("Emails or user IDs to target, up to 500."),
	matchBy: z
		.enum(["email", "user_id"])
		.optional()
		.default("email")
		.describe("Whether users holds emails (default) or user IDs."),
	mode: z
		.enum(["append", "replace"])
		.optional()
		.default("append")
		.describe(
			"append (default) adds one rule; replace deletes every existing rule first."
		),
};

const TargetedFlagSchema = z.object({
	id: z.string(),
	key: z.string(),
	name: z.string().nullable().optional(),
	rules: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
	status: flagFormShape.status.optional(),
});

function appendableFlagRules(rules: unknown[]) {
	const parsed = z.array(userRuleSchema).safeParse(rules);
	if (!parsed.success) {
		throw new McpToolError(
			"invalid_input",
			"This flag's existing rules use an older format that cannot be appended to.",
			{
				hint: "Use mode=replace to start the rules over, or rewrite them with update_flag.",
			}
		);
	}
	return parsed.data;
}

export function planUserTargeting(
	flag: unknown,
	{ matchBy, mode, users }: z.output<z.ZodObject<typeof userTargetingFields>>
) {
	const current = TargetedFlagSchema.parse(flag);
	const existingRules = current.rules ?? [];
	const uniqueUsers = [...new Set(users)];
	const rules = [
		...(mode === "replace" ? [] : appendableFlagRules(existingRules)),
		createUserTargetRule(matchBy, uniqueUsers),
	];
	return {
		flag: pickFields(current, FLAG_IDENTITY_FIELDS),
		rules,
		targeting: {
			matchBy,
			mode,
			userCount: uniqueUsers.length,
			ruleCountBefore: existingRules.length,
			ruleCountAfter: rules.length,
		},
	};
}

export function flagCreatePayload<
	T extends {
		defaultValue?: boolean;
		rolloutPercentage?: number;
		status?: z.infer<typeof flagFormShape.status>;
		type?: z.infer<typeof flagFormShape.type>;
	},
>(input: T) {
	const payload = {
		...input,
		defaultValue: input.defaultValue ?? false,
		rolloutPercentage: input.rolloutPercentage ?? 0,
		status: input.status ?? "inactive",
		type: input.type ?? "boolean",
	};
	const issue = flagFormSchema.safeParse(payload).error?.issues[0];
	if (issue) {
		throw new McpToolError(
			"invalid_input",
			`${issue.path.join(".")}: ${issue.message}`
		);
	}
	return payload;
}

export function createFlagTools() {
	const listFlagsTool = tool({
		description:
			"List feature flags for a website. Use before updating or targeting a flag.",
		inputSchema: z.object({
			websiteId: z.string(),
			status: flagFormShape.status.optional(),
		}),
		execute: async ({ websiteId, status }, options) => {
			const context = getAppContext(options);
			try {
				const result = await callRPCProcedure(
					"flags",
					"list",
					{ websiteId, status },
					context
				);
				return {
					flags: result,
					count: Array.isArray(result) ? result.length : 0,
				};
			} catch (error) {
				logger.error("Failed to list flags", { websiteId, status, error });
				throw error;
			}
		},
	});

	const createFlagTool = tool({
		description:
			"Create a feature flag. Defaults to inactive boolean flag until explicitly configured.",
		inputSchema: z.object({
			websiteId: z.string(),
			key: flagFormShape.key,
			...flagConfigFields,
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		needsApproval: ({ confirmed }) => confirmed === true,
		execute: async ({ confirmed, ...input }, options) => {
			const context = getAppContext(options);
			try {
				const payload = flagCreatePayload(input);

				if (!confirmed) {
					return {
						preview: true,
						message: "Review this feature flag before creating it.",
						flag: {
							key: payload.key,
							name: payload.name ?? payload.key,
							type: payload.type,
							status: payload.status,
							defaultValue: payload.defaultValue,
							rolloutPercentage: payload.rolloutPercentage,
							ruleCount: payload.rules?.length ?? 0,
							variantCount: payload.variants?.length ?? 0,
						},
						confirmationRequired: true,
						instruction:
							"To create this flag, the user must explicitly confirm. Only then call this tool again with confirmed=true.",
					};
				}

				const result = await callRPCProcedure(
					"flags",
					"create",
					payload,
					context
				);

				return {
					success: true,
					message: `Feature flag "${payload.key}" created successfully`,
					flag: result,
				};
			} catch (error) {
				logger.error("Failed to create flag", {
					websiteId: input.websiteId,
					key: input.key,
					error,
				});
				throw error;
			}
		},
	});

	const updateFlagTool = tool({
		description:
			"Update feature flag config, status, rollout, rules, or variants.",
		inputSchema: z.object({
			id: z.string(),
			...flagConfigFields,
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		needsApproval: ({ confirmed }) => confirmed === true,
		execute: async ({ confirmed, id, ...updates }, options) => {
			const context = getAppContext(options);
			const cleanUpdates = omitUndefined(updates);

			try {
				if (!confirmed) {
					return {
						preview: true,
						message: "Review this feature flag update before applying it.",
						flagId: id,
						updates: cleanUpdates,
						confirmationRequired: true,
						instruction:
							"To update this flag, the user must explicitly confirm. Only then call this tool again with confirmed=true.",
					};
				}

				const result = await callRPCProcedure(
					"flags",
					"update",
					{ id, ...cleanUpdates },
					context
				);

				return {
					success: true,
					message: "Feature flag updated successfully",
					flag: result,
				};
			} catch (error) {
				logger.error("Failed to update flag", { id, error });
				throw error;
			}
		},
	});

	const addUsersToFlagTool = tool({
		description:
			"Add user IDs or emails to a feature flag targeting rule. Reads the current flag and appends or replaces user targeting rules.",
		inputSchema: z.object({
			flagId: z.string(),
			websiteId: z.string(),
			...userTargetingFields,
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		needsApproval: ({ confirmed }) => confirmed === true,
		execute: async ({ flagId, websiteId, confirmed, ...input }, options) => {
			const context = getAppContext(options);
			try {
				const { flag, rules, targeting } = planUserTargeting(
					await callRPCProcedure(
						"flags",
						"getById",
						{ id: flagId, websiteId },
						context
					),
					input
				);

				if (!confirmed) {
					return {
						preview: true,
						message:
							"Review this feature flag targeting change before applying it.",
						flag,
						targeting,
						confirmationRequired: true,
						instruction:
							"To apply this targeting change, the user must explicitly confirm. Only then call this tool again with confirmed=true.",
					};
				}

				const result = await callRPCProcedure(
					"flags",
					"update",
					{ id: flagId, rules },
					context
				);

				return {
					success: true,
					message: `Added ${targeting.userCount} ${targeting.matchBy === "email" ? "email" : "user ID"} target${targeting.userCount === 1 ? "" : "s"} to the flag.`,
					flag: result,
				};
			} catch (error) {
				logger.error("Failed to add users to flag", {
					flagId,
					websiteId,
					userCount: input.users.length,
					error,
				});
				throw error;
			}
		},
	});

	return {
		list_flags: listFlagsTool,
		create_flag: createFlagTool,
		update_flag: updateFlagTool,
		add_users_to_flag: addUsersToFlagTool,
	} as const;
}
