import { tool } from "ai";
import {
	flagFormSchema,
	flagFormShape,
	userRuleSchema,
} from "@databuddy/shared/flags";
import { z } from "zod";
import { createUserTargetRule, type FlagTargetRule } from "./flag-rules";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Flags Tools");
const flagStatusSchema = flagFormShape.status;
const flagTypeSchema = flagFormShape.type;

const flagRecordSchema = z
	.object({
		id: z.string(),
		key: z.string().optional(),
		name: z.string().nullable().optional(),
		rules: z.unknown().optional(),
		status: flagStatusSchema.optional(),
	})
	.passthrough();

const flagTargetRuleSchema = userRuleSchema;

const listFlagsInputSchema = z.object({
	websiteId: z.string(),
	status: flagStatusSchema.optional(),
});

const createFlagInputSchema = z.object({
	websiteId: z.string(),
	key: flagFormShape.key,
	name: flagFormShape.name,
	description: flagFormShape.description,
	type: flagTypeSchema.optional(),
	status: flagStatusSchema.optional(),
	defaultValue: flagFormShape.defaultValue.optional(),
	payload: z.record(z.string(), z.unknown()).optional(),
	persistAcrossAuth: z.boolean().optional(),
	rolloutPercentage: flagFormShape.rolloutPercentage.optional(),
	rolloutBy: flagFormShape.rolloutBy,
	rules: flagFormShape.rules,
	variants: flagFormShape.variants,
	dependencies: flagFormShape.dependencies,
	environment: flagFormShape.environment,
	targetGroupIds: flagFormShape.targetGroupIds,
	confirmed: z.boolean().describe("false=preview, true=apply"),
});

const updateFlagInputSchema = createFlagInputSchema
	.omit({ key: true, websiteId: true })
	.extend({ environment: z.string().optional(), id: z.string() });

const addUsersToFlagInputSchema = z.object({
	flagId: z.string(),
	websiteId: z.string(),
	users: z.array(z.string().min(1)).min(1).max(500),
	matchBy: z.enum(["user_id", "email"]).optional().default("email"),
	mode: z.enum(["append", "replace"]).optional().default("append"),
	confirmed: z.boolean().describe("false=preview, true=apply"),
});

export function createFlagTools() {
	const listFlagsTool = tool({
		description:
			"List feature flags for a website. Use before updating or targeting a flag.",
		inputSchema: listFlagsInputSchema,
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
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve feature flags. Please try again.");
			}
		},
	});

	const createFlagTool = tool({
		description:
			"Create a feature flag. Defaults to inactive boolean flag until explicitly configured.",
		inputSchema: createFlagInputSchema,
		execute: async ({ confirmed, ...input }, options) => {
			const context = getAppContext(options);
			const payload = {
				...input,
				defaultValue: input.defaultValue ?? false,
				rolloutPercentage: input.rolloutPercentage ?? 0,
				status: input.status ?? "inactive",
				type: input.type ?? "boolean",
			};

			try {
				const validation = flagFormSchema.safeParse(payload);
				if (!validation.success) {
					const issue = validation.error.issues[0];
					throw new Error(
						issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid flag"
					);
				}

				if (!confirmed) {
					return {
						preview: true,
						message: "Please review this feature flag before creating it.",
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
					message: `Feature flag "${payload.key}" created successfully.`,
					flag: result,
				};
			} catch (error) {
				logger.error("Failed to create flag", {
					websiteId: input.websiteId,
					key: input.key,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to create feature flag. Please try again.");
			}
		},
	});

	const updateFlagTool = tool({
		description:
			"Update feature flag config, status, rollout, rules, or variants.",
		inputSchema: updateFlagInputSchema,
		execute: async ({ confirmed, id, ...updates }, options) => {
			const context = getAppContext(options);
			const cleanUpdates = omitUndefined(updates);

			try {
				if (!confirmed) {
					return {
						preview: true,
						message: "Please review this feature flag update.",
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
					message: "Feature flag updated successfully.",
					flag: result,
				};
			} catch (error) {
				logger.error("Failed to update flag", { id, error });
				throw error instanceof Error
					? error
					: new Error("Failed to update feature flag. Please try again.");
			}
		},
	});

	const addUsersToFlagTool = tool({
		description:
			"Add user IDs or emails to a feature flag targeting rule. Reads the current flag and appends or replaces user targeting rules.",
		inputSchema: addUsersToFlagInputSchema,
		execute: async (
			{ flagId, websiteId, users, matchBy, mode, confirmed },
			options
		) => {
			const context = getAppContext(options);
			const uniqueUsers = [...new Set(users.map((user) => user.trim()))].filter(
				Boolean
			);
			const newRule = createUserTargetRule(matchBy, uniqueUsers);

			try {
				const currentFlag = flagRecordSchema.parse(
					await callRPCProcedure(
						"flags",
						"getById",
						{ id: flagId, websiteId },
						context
					)
				);
				const currentRules = parseFlagRules(currentFlag.rules);
				const nextRules =
					mode === "replace" ? [newRule] : [...currentRules, newRule];

				if (!confirmed) {
					return {
						preview: true,
						message: "Please review this feature flag targeting change.",
						flag: {
							id: currentFlag.id,
							key: currentFlag.key,
							name: currentFlag.name,
							status: currentFlag.status,
						},
						targeting: {
							matchBy,
							mode,
							userCount: uniqueUsers.length,
							ruleCountBefore: currentRules.length,
							ruleCountAfter: nextRules.length,
						},
						confirmationRequired: true,
						instruction:
							"To apply this targeting change, the user must explicitly confirm. Only then call this tool again with confirmed=true.",
					};
				}

				const result = await callRPCProcedure(
					"flags",
					"update",
					{ id: flagId, rules: nextRules },
					context
				);

				return {
					success: true,
					message: `Added ${uniqueUsers.length} ${matchBy === "email" ? "email" : "user ID"} target${uniqueUsers.length === 1 ? "" : "s"} to the flag.`,
					flag: result,
				};
			} catch (error) {
				logger.error("Failed to add users to flag", {
					flagId,
					websiteId,
					userCount: uniqueUsers.length,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to update feature flag targeting.");
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

function parseFlagRules(value: unknown): FlagTargetRule[] {
	if (value == null) {
		return [];
	}
	const result = z.array(flagTargetRuleSchema).safeParse(value);
	if (!result.success) {
		const storedCount = Array.isArray(value) ? value.length : "unknown";
		throw new Error(
			`Existing flag rules (${storedCount}) do not match the expected schema. Refusing to modify the flag to avoid destroying targeting configuration.`
		);
	}
	return result.data;
}

function omitUndefined(
	input: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined)
	);
}
