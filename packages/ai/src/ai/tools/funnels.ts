import { funnelStepSchema } from "@databuddy/rpc/funnel-steps";
import { analyticsCohortSchema } from "@databuddy/shared/analytics-filters";
import { type ToolExecutionOptions, tool } from "ai";
import { analyticsDateRangeSchema } from "@databuddy/validation";
import { z } from "zod";
import {
	callRPCProcedure,
	createToolLogger,
	getAppContext,
	resolveToolWebsite,
} from "./utils";
import { describeGoalFunnelFilters, goalFunnelFilterSchema } from "./goals";
import { resolveToolDateRange } from "./utils/context";

const logger = createToolLogger("Funnels Tools");

export const funnelFields = {
	name: z.string().min(1).max(100).describe("Funnel name."),
	description: z.string().optional().describe("What the funnel tracks."),
	steps: z
		.array(z.strictObject(funnelStepSchema.omit({ conditions: true }).shape))
		.min(2)
		.max(10)
		.describe(
			"2 to 10 steps in order. Each target is a page path (PAGE_VIEW) or event name (EVENT or CUSTOM)."
		),
	filters: z
		.array(goalFunnelFilterSchema)
		.optional()
		.describe("Filters every step must match."),
	ignoreHistoricData: z
		.boolean()
		.optional()
		.describe("true counts only data from the funnel's creation date onward."),
};

const funnelAnalyticsInputSchema = analyticsDateRangeSchema.safeExtend({
	funnelId: z.string(),
	websiteId: z.string().optional(),
	cohort: analyticsCohortSchema
		.nullish()
		.describe(
			"Additional cohort filters, or null to measure the saved definition without extra filtering."
		),
});

function readFunnelAnalytics(
	method: "getAnalytics" | "getAnalyticsByReferrer",
	failure: string
) {
	return async (
		{
			funnelId,
			websiteId: inputWebsiteId,
			startDate,
			endDate,
			cohort,
		}: z.infer<typeof funnelAnalyticsInputSchema>,
		options: ToolExecutionOptions
	) => {
		const context = getAppContext(options);
		const { websiteId } = resolveToolWebsite(context, inputWebsiteId);
		try {
			return await callRPCProcedure(
				"funnels",
				method,
				{
					funnelId,
					websiteId,
					...resolveToolDateRange({ startDate, endDate }, context),
					cohort: cohort ?? undefined,
				},
				context
			);
		} catch (error) {
			logger.error(failure, {
				funnelId,
				websiteId,
				startDate,
				endDate,
				error,
			});
			throw error;
		}
	};
}

export function createFunnelTools() {
	const listFunnelsTool = tool({
		description:
			"List funnels with steps, filters, and metadata. Omit websiteId to use the current website.",
		inputSchema: z.object({ websiteId: z.string().optional() }),
		execute: async ({ websiteId: inputWebsiteId }, options) => {
			const context = getAppContext(options);
			const { websiteId } = resolveToolWebsite(context, inputWebsiteId);
			try {
				const result = await callRPCProcedure(
					"funnels",
					"list",
					{ websiteId },
					context
				);
				return {
					funnels: result,
					count: Array.isArray(result) ? result.length : 0,
				};
			} catch (error) {
				logger.error("Failed to list funnels", { websiteId, error });
				throw error;
			}
		},
	});

	const getFunnelAnalyticsTool = tool({
		description:
			"Funnel definition, measured dates and distinct visitor counts. savedDefinition is the saved configuration; measurement.definition includes read-time cohort filters. A filtered measurement alone does not establish a saved-definition change. Entrants match the first step; completions reach every ordered step within a 24-hour completion window. Final-step users are ordered-path completions, not all visitors to that page/event. These are visitors, not projects, occurrences or attempts. Optional cohort measures browser, device, country or campaign segments without editing the saved definition. Compare cohorts and periods with parallel calls. Omitted dates default to last 30 calendar days in the conversation timezone. Reuse matching verified measurements; remeasure stale or conflicting context.",
		inputSchema: funnelAnalyticsInputSchema,
		execute: readFunnelAnalytics(
			"getAnalytics",
			"Failed to get funnel analytics"
		),
	});

	const getFunnelAnalyticsByReferrerTool = tool({
		description:
			"Distinct visitors entering the first funnel step and completing its ordered steps, within a 24-hour completion window, grouped by the visitor's earliest first-step referrer in the queried period. Counts are visitors, not projects or attempts. Omitted dates default to last 30 calendar days in the conversation timezone. Accepts one date range; compare periods with separate calls.",
		inputSchema: funnelAnalyticsInputSchema,
		execute: readFunnelAnalytics(
			"getAnalyticsByReferrer",
			"Failed to get funnel analytics by referrer"
		),
	});

	const createFunnelTool = tool({
		description: "Create a funnel to track a user journey.",
		inputSchema: z.object({
			websiteId: z.string(),
			...funnelFields,
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		needsApproval: ({ confirmed }) => confirmed === true,
		execute: async ({ websiteId, confirmed, ...funnel }, options) => {
			const context = getAppContext(options);
			try {
				if (!confirmed) {
					return {
						preview: true,
						message:
							"Please review the funnel details below and confirm if you want to create it:",
						funnel: {
							name: funnel.name,
							description: funnel.description || "No description",
							steps: funnel.steps
								.map(
									(step, index) =>
										`${index + 1}. ${step.name} (${step.type}: ${step.target})`
								)
								.join("\n"),
							filters: describeGoalFunnelFilters(funnel.filters),
							ignoreHistoricData: funnel.ignoreHistoricData ?? false,
						},
						confirmationRequired: true,
						instruction:
							"To create this funnel, the user must explicitly confirm (e.g., 'yes', 'create it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				const result = await callRPCProcedure(
					"funnels",
					"create",
					{ websiteId, ...funnel },
					context
				);

				return {
					success: true,
					message: `Funnel "${funnel.name}" created successfully`,
					funnel: result,
				};
			} catch (error) {
				logger.error("Failed to create funnel", {
					websiteId,
					name: funnel.name,
					error,
				});
				throw error;
			}
		},
	});

	return {
		list_funnels: listFunnelsTool,
		get_funnel_analytics: getFunnelAnalyticsTool,
		get_funnel_analytics_by_referrer: getFunnelAnalyticsByReferrerTool,
		create_funnel: createFunnelTool,
	} as const;
}
