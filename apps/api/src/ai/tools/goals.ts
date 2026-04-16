import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Goals Tools");

export function createGoalTools() {
	const listGoalsTool = tool({
		description: "List goals with type, target, filters, metadata.",
		inputSchema: z.object({ websiteId: z.string() }),
		execute: async ({ websiteId }, options) => {
			const context = getAppContext(options);
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

	const getGoalAnalyticsTool = tool({
		description:
			"Goal analytics: conversion rate, users entered, users completed. Dates YYYY-MM-DD, default last 30d.",
		inputSchema: z.object({
			goalId: z.string(),
			websiteId: z.string(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
		}),
		execute: async ({ goalId, websiteId, startDate, endDate }, options) => {
			const context = getAppContext(options);
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
			"Create a single-step conversion goal. Target is a page path (PAGE_VIEW) or event name (EVENT/CUSTOM).",
		inputSchema: z.object({
			websiteId: z.string(),
			name: z.string().min(1).max(100),
			description: z.string().optional(),
			type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
			target: z.string().min(1),
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
				.optional(),
			ignoreHistoricData: z.boolean().optional(),
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		execute: async (
			{
				websiteId,
				name,
				description,
				type,
				target,
				filters,
				ignoreHistoricData,
				confirmed,
			},
			options
		) => {
			const context = getAppContext(options);
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
		description: "Update a goal.",
		inputSchema: z.object({
			id: z.string(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().optional(),
			type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]).optional(),
			target: z.string().min(1).optional(),
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
				.optional(),
			ignoreHistoricData: z.boolean().optional(),
			isActive: z.boolean().optional(),
		}),
		execute: async (
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
			options
		) => {
			const context = getAppContext(options);
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
		description: "Delete a goal. Cannot be undone.",
		inputSchema: z.object({
			id: z.string(),
			confirmed: z.boolean().describe("false=preview, true=delete"),
		}),
		execute: async ({ id, confirmed }, options) => {
			const context = getAppContext(options);
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
		get_goal_analytics: getGoalAnalyticsTool,
		create_goal: createGoalTool,
		update_goal: updateGoalTool,
		delete_goal: deleteGoalTool,
	} as const;
}
