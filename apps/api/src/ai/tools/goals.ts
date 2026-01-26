import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import type { AppContext } from "../config/context";
import { callRPCProcedure, createToolLogger } from "./utils";

const logger = createToolLogger("Goals Tools");

export function createGoalTools(context: AppContext) {
	const listGoalsTool = tool({
		description:
			"List all goals for a website. Returns goals with their type, target, filters, and metadata.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID to get goals for"),
		}),
		execute: async ({ websiteId }) => {
			try {
				const result = await callRPCProcedure(
					"goals",
					"list",
					{ websiteId },
					context
				);
				return {
					goals: result,
					count: Array.isArray(result) ? result.length : 0,
				};
			} catch (error) {
				logger.error("Failed to list goals", { websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve goals. Please try again.");
			}
		},
	});

	const getGoalByIdTool = tool({
		description:
			"Get a specific goal by ID. Returns detailed information including type, target, filters, and configuration.",
		inputSchema: z.object({
			id: z.string().describe("The goal ID"),
			websiteId: z.string().describe("The website ID"),
		}),
		execute: async ({ id, websiteId }) => {
			try {
				return await callRPCProcedure(
					"goals",
					"getById",
					{ id, websiteId },
					context
				);
			} catch (error) {
				logger.error("Failed to get goal by ID", { id, websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve goal. Please try again.");
			}
		},
	});

	const getGoalAnalyticsTool = tool({
		description:
			"Get analytics data for a goal. Returns conversion rates, total users entered, total users completed, and overall conversion rate.",
		inputSchema: z.object({
			goalId: z.string().describe("The goal ID"),
			websiteId: z.string().describe("The website ID"),
			startDate: z
				.string()
				.optional()
				.describe("Start date in YYYY-MM-DD format (defaults to 30 days ago)"),
			endDate: z
				.string()
				.optional()
				.describe("End date in YYYY-MM-DD format (defaults to today)"),
		}),
		execute: async ({ goalId, websiteId, startDate, endDate }) => {
			try {
				if (startDate && !dayjs(startDate).isValid()) {
					throw new Error(
						"Start date must be in YYYY-MM-DD format (e.g., 2024-01-15)."
					);
				}
				if (endDate && !dayjs(endDate).isValid()) {
					throw new Error(
						"End date must be in YYYY-MM-DD format (e.g., 2024-01-15)."
					);
				}

				return await callRPCProcedure(
					"goals",
					"getAnalytics",
					{ goalId, websiteId, startDate, endDate },
					context
				);
			} catch (error) {
				logger.error("Failed to get goal analytics", {
					goalId,
					websiteId,
					startDate,
					endDate,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve goal analytics. Please try again.");
			}
		},
	});

	const createGoalTool = tool({
		description:
			"Create a new goal to track single-step conversions. REQUIRES EXPLICIT USER CONFIRMATION before creating. Always show a preview first and ask the user to confirm before setting confirmed=true.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID"),
			name: z
				.string()
				.min(1)
				.max(100)
				.describe("The goal name (1-100 characters)"),
			description: z
				.string()
				.optional()
				.describe("Optional description of the goal"),
			type: z
				.enum(["PAGE_VIEW", "EVENT", "CUSTOM"])
				.describe(
					"Goal type: PAGE_VIEW for page paths, EVENT for custom events"
				),
			target: z
				.string()
				.min(1)
				.describe(
					"Goal target: page path (e.g., '/thank-you') or event name (e.g., 'purchase_complete')"
				),
			filters: z
				.array(
					z.object({
						field: z.string().describe("Filter field name"),
						operator: z
							.enum(["equals", "contains", "not_equals", "in", "not_in"])
							.describe("Filter operator"),
						value: z
							.union([z.string(), z.array(z.string())])
							.describe("Filter value (string or array of strings)"),
					})
				)
				.optional()
				.describe("Optional filters to apply to the goal"),
			ignoreHistoricData: z
				.boolean()
				.optional()
				.describe(
					"Whether to ignore historic data before goal creation (default: false)"
				),
			confirmed: z
				.boolean()
				.describe(
					"CRITICAL: Must be false initially. Only set to true after user explicitly confirms. When false, returns a preview and asks for confirmation."
				),
		}),
		execute: async ({
			websiteId,
			name,
			description,
			type,
			target,
			filters,
			ignoreHistoricData,
			confirmed,
		}) => {
			try {
				// If not confirmed, return preview and ask for confirmation
				if (!confirmed) {
					const filtersPreview =
						filters && filters.length > 0
							? filters
								.map(
									(filter) =>
										`- ${filter.field} ${filter.operator} ${Array.isArray(filter.value) ? filter.value.join(", ") : filter.value}`
								)
								.join("\n")
							: "None";

					return {
						preview: true,
						message:
							"Please review the goal details below and confirm if you want to create it:",
						goal: {
							name,
							description: description || null,
							type,
							target,
							filters: filtersPreview,
							ignoreHistoricData: ignoreHistoricData ?? false,
						},
						confirmationRequired: true,
						instruction:
							"To create this goal, the user must explicitly confirm (e.g., 'yes', 'create it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				// User confirmed - create the goal
				const result = await callRPCProcedure(
					"goals",
					"create",
					{
						websiteId,
						name,
						description,
						type,
						target,
						filters,
						ignoreHistoricData: ignoreHistoricData ?? false,
					},
					context
				);

				return {
					success: true,
					message: `Goal "${name}" created successfully`,
					goal: result,
				};
			} catch (error) {
				logger.error("Failed to create goal", {
					websiteId,
					name,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to create goal. Please try again.");
			}
		},
	});

	const updateGoalTool = tool({
		description:
			"Update an existing goal. Can modify name, description, type, target, filters, active status, or ignore historic data setting.",
		inputSchema: z.object({
			id: z.string().describe("The goal ID to update"),
			name: z.string().min(1).max(100).optional().describe("New goal name"),
			description: z.string().optional().describe("New goal description"),
			type: z
				.enum(["PAGE_VIEW", "EVENT", "CUSTOM"])
				.optional()
				.describe("New goal type"),
			target: z.string().min(1).optional().describe("New goal target"),
			filters: z
				.array(
					z.object({
						field: z.string(),
						operator: z.enum([
							"equals",
							"contains",
							"not_equals",
							"in",
							"not_in",
						]),
						value: z.union([z.string(), z.array(z.string())]),
					})
				)
				.optional()
				.describe("New filters"),
			ignoreHistoricData: z.boolean().optional(),
			isActive: z
				.boolean()
				.optional()
				.describe("Whether the goal is active (paused if false)"),
		}),
		execute: async ({
			id,
			name,
			description,
			type,
			target,
			filters,
			ignoreHistoricData,
			isActive,
		}) => {
			try {
				const result = await callRPCProcedure(
					"goals",
					"update",
					{
						id,
						name,
						description,
						type,
						target,
						filters,
						ignoreHistoricData,
						isActive,
					},
					context
				);

				return {
					success: true,
					message: "Goal updated successfully",
					goal: result,
				};
			} catch (error) {
				logger.error("Failed to update goal", { id, error });
				throw error instanceof Error
					? error
					: new Error("Failed to update goal. Please try again.");
			}
		},
	});

	const deleteGoalTool = tool({
		description:
			"Delete a goal. REQUIRES EXPLICIT USER CONFIRMATION before deleting. Always ask for confirmation first.",
		inputSchema: z.object({
			id: z.string().describe("The goal ID to delete"),
			confirmed: z
				.boolean()
				.describe(
					"CRITICAL: Must be false initially. Only set to true after user explicitly confirms deletion."
				),
		}),
		execute: async ({ id, confirmed }) => {
			try {
				if (!confirmed) {
					return {
						preview: true,
						message:
							"Are you sure you want to delete this goal? This action cannot be undone and will permanently remove all goal analytics data.",
						goalId: id,
						confirmationRequired: true,
						instruction:
							"To delete this goal, the user must explicitly confirm (e.g., 'yes', 'delete it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				await callRPCProcedure("goals", "delete", { id }, context);

				return {
					success: true,
					message: "Goal deleted successfully",
				};
			} catch (error) {
				logger.error("Failed to delete goal", { id, error });
				throw error instanceof Error
					? error
					: new Error("Failed to delete goal. Please try again.");
			}
		},
	});

	return {
		list_goals: listGoalsTool,
		get_goal_by_id: getGoalByIdTool,
		get_goal_analytics: getGoalAnalyticsTool,
		create_goal: createGoalTool,
		update_goal: updateGoalTool,
		delete_goal: deleteGoalTool,
	} as const;
}
