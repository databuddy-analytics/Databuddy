import { filterSchema, funnelStepSchema } from "@databuddy/rpc/funnel-steps";
import {
	analyticsCohortSchema,
	goalFunnelFilterFields,
} from "@databuddy/shared/analytics-filters";
import { tool } from "ai";
import { analyticsDateRangeSchema } from "@databuddy/validation";
import { z } from "zod";
import {
	callRPCProcedure,
	createToolLogger,
	getAppContext,
	omitUndefined,
	resolveToolWebsite,
} from "./utils";
import { resolveToolDateRange } from "./utils/context";

const logger = createToolLogger("Goals Tools");

export const goalTypeSchema = funnelStepSchema.shape.type.describe(
	"PAGE_VIEW: target is a page path. EVENT or CUSTOM: target is an event name."
);
export const goalFunnelFilterSchema = z.strictObject({
	...filterSchema.shape,
	field: z.enum(goalFunnelFilterFields.map((field) => field.value)),
});

export function describeGoalFunnelFilters(
	filters: z.infer<typeof goalFunnelFilterSchema>[] | undefined
): string {
	if (!filters?.length) {
		return "None";
	}
	return filters
		.map(
			(filter) =>
				`- ${filter.field} ${filter.operator} ${Array.isArray(filter.value) ? filter.value.join(", ") : filter.value}`
		)
		.join("\n");
}

const goalAnalyticsInputSchema = analyticsDateRangeSchema.safeExtend({
	goalId: z.string(),
	websiteId: z.string().optional(),
	cohort: analyticsCohortSchema
		.nullish()
		.describe(
			"Additional cohort filters, or null to measure the saved definition without extra filtering."
		),
});
export const goalFields = {
	type: goalTypeSchema,
	target: z
		.string()
		.min(1)
		.describe("Page path for PAGE_VIEW, event name for EVENT or CUSTOM."),
	name: z.string().min(1).max(100).describe("Goal name."),
	description: z
		.string()
		.nullable()
		.optional()
		.describe("What the goal measures."),
	filters: z
		.array(goalFunnelFilterSchema)
		.optional()
		.describe("Filters every conversion must match."),
	ignoreHistoricData: z
		.boolean()
		.optional()
		.describe("true counts only data from the goal's creation date onward."),
};
const createGoalInputSchema = z.object({
	websiteId: z.string(),
	...goalFields,
	confirmed: z.boolean().describe("false=preview, true=apply"),
});
const updateGoalInputSchema = createGoalInputSchema
	.omit({ websiteId: true })
	.partial()
	.extend({
		id: z.string(),
		isActive: z.boolean().optional(),
		confirmed: createGoalInputSchema.shape.confirmed.default(false),
	});

export function createGoalTools() {
	const listGoalsTool = tool({
		description:
			"List goals with type, target, filters, and metadata. Omit websiteId to use the current website.",
		inputSchema: z.object({ websiteId: z.string().optional() }),
		execute: async ({ websiteId: inputWebsiteId }, options) => {
			const context = getAppContext(options);
			const { websiteId } = resolveToolWebsite(context, inputWebsiteId);
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
				throw error;
			}
		},
	});

	const getGoalAnalyticsTool = tool({
		description:
			"Goal definition, measured dates and distinct visitor counts. savedDefinition is the saved configuration; measurement.definition includes read-time cohort filters. A filtered measurement alone does not establish a saved-definition change. total_users_entered: website page-view visitors matching filters except event_name. total_users_completed: visitors matching the goal. overall_conversion_rate: completed / entered percent, not login or attempt success. Optional cohort measures browser, device, country or campaign segments without editing the saved definition. Compare cohorts and periods with parallel calls. Omitted dates default to last 30 calendar days in the conversation timezone. Reuse matching verified measurements; remeasure stale or conflicting context.",
		inputSchema: goalAnalyticsInputSchema,
		execute: async (
			{ goalId, websiteId: inputWebsiteId, startDate, endDate, cohort },
			options
		) => {
			const context = getAppContext(options);
			const { websiteId } = resolveToolWebsite(context, inputWebsiteId);
			try {
				return await callRPCProcedure(
					"goals",
					"getAnalytics",
					{
						goalId,
						websiteId,
						...resolveToolDateRange({ startDate, endDate }, context),
						cohort: cohort ?? undefined,
					},
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
				throw error;
			}
		},
	});

	const createGoalTool = tool({
		description:
			"Create a single-step conversion goal. Target is a page path (PAGE_VIEW) or event name (EVENT/CUSTOM).",
		inputSchema: createGoalInputSchema,
		needsApproval: ({ confirmed }) => confirmed === true,
		execute: async ({ websiteId, confirmed, ...goal }, options) => {
			const context = getAppContext(options);
			try {
				if (!confirmed) {
					return {
						preview: true,
						message:
							"Please review the goal details below and confirm if you want to create it:",
						goal: {
							name: goal.name,
							description: goal.description || null,
							type: goal.type,
							target: goal.target,
							filters: describeGoalFunnelFilters(goal.filters),
							ignoreHistoricData: goal.ignoreHistoricData ?? false,
						},
						confirmationRequired: true,
						instruction:
							"To create this goal, the user must explicitly confirm (e.g., 'yes', 'create it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				const result = await callRPCProcedure(
					"goals",
					"create",
					{ websiteId, ...goal },
					context
				);

				return {
					success: true,
					message: `Goal "${goal.name}" created successfully`,
					goal: result,
				};
			} catch (error) {
				logger.error("Failed to create goal", {
					websiteId,
					name: goal.name,
					error,
				});
				throw error;
			}
		},
	});

	const updateGoalTool = tool({
		description:
			"Update a goal. Preview changes first, then set confirmed=true after explicit user approval.",
		inputSchema: updateGoalInputSchema,
		needsApproval: ({ confirmed }) => confirmed === true,
		execute: async ({ id, confirmed, ...input }, options) => {
			const context = getAppContext(options);
			const updates = omitUndefined(input);
			const hasUpdates = Object.keys(updates).length > 0;
			try {
				if (!(confirmed && hasUpdates)) {
					const current = await callRPCProcedure(
						"goals",
						"getById",
						{ id },
						context
					);
					if (!hasUpdates) {
						return {
							preview: true,
							message: "No changes detected. The goal will remain unchanged.",
							confirmationRequired: false,
							current,
							updates,
						};
					}
					return {
						preview: true,
						message: "Please review this goal update before applying it.",
						current,
						updates,
						confirmationRequired: true,
						instruction:
							"To update this goal, the user must explicitly confirm. Only then call this tool again with confirmed=true.",
					};
				}

				const result = await callRPCProcedure(
					"goals",
					"update",
					{ id, ...updates },
					context
				);

				return {
					success: true,
					message: "Goal updated successfully",
					goal: result,
				};
			} catch (error) {
				logger.error("Failed to update goal", { id, error });
				throw error;
			}
		},
	});

	const deleteGoalTool = tool({
		description: "Delete a goal. Cannot be undone.",
		inputSchema: z.object({
			id: z.string(),
			confirmed: z.boolean().describe("false=preview, true=delete"),
		}),
		needsApproval: ({ confirmed }) => confirmed === true,
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
				throw error;
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
