import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Funnels Tools");

export function createFunnelTools() {
	const listFunnelsTool = tool({
		description: "List funnels with steps, filters, metadata.",
		inputSchema: z.object({ websiteId: z.string() }),
		execute: async ({ websiteId }, options) => {
			const context = getAppContext(options);
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
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve funnels. Please try again.");
			}
		},
	});

	const getFunnelAnalyticsTool = tool({
		description:
			"Funnel analytics: conversion rates, drop-offs, step metrics. Dates YYYY-MM-DD, default last 30d.",
		inputSchema: z.object({
			funnelId: z.string(),
			websiteId: z.string(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
		}),
		execute: async ({ funnelId, websiteId, startDate, endDate }, options) => {
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
					"funnels",
					"getAnalytics",
					{ funnelId, websiteId, startDate, endDate },
					context
				);
			} catch (error) {
				logger.error("Failed to get funnel analytics", {
					funnelId,
					websiteId,
					startDate,
					endDate,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve funnel analytics. Please try again.");
			}
		},
	});

	const getFunnelAnalyticsByReferrerTool = tool({
		description:
			"Funnel analytics broken down by referrer/source. Shows which sources convert best.",
		inputSchema: z.object({
			funnelId: z.string(),
			websiteId: z.string(),
			startDate: z.string().optional(),
			endDate: z.string().optional(),
		}),
		execute: async ({ funnelId, websiteId, startDate, endDate }, options) => {
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
					"funnels",
					"getAnalyticsByReferrer",
					{ funnelId, websiteId, startDate, endDate },
					context
				);
			} catch (error) {
				logger.error("Failed to get funnel analytics by referrer", {
					funnelId,
					websiteId,
					startDate,
					endDate,
					error,
				});
				throw error instanceof Error
					? error
					: new Error(
							"Failed to retrieve funnel analytics by referrer. Please try again."
						);
			}
		},
	});

	const createFunnelTool = tool({
		description:
			"Create a funnel to track a user journey. 2-10 steps where target is a page path (PAGE_VIEW) or event name.",
		inputSchema: z.object({
			websiteId: z.string(),
			name: z.string().min(1).max(100),
			description: z.string().optional(),
			steps: z
				.array(
					z.object({
						type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
						target: z.string().min(1),
						name: z.string().min(1),
						conditions: z.record(z.string(), z.unknown()).optional(),
					})
				)
				.min(2)
				.max(10),
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
				steps,
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
					const stepsPreview = steps
						.map(
							(step, index) =>
								`${index + 1}. ${step.name} (${step.type}: ${step.target})`
						)
						.join("\n");
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
							"Please review the funnel details below and confirm if you want to create it:",
						funnel: {
							name,
							description: description || "No description",
							steps: stepsPreview,
							filters: filtersPreview,
							ignoreHistoricData: ignoreHistoricData ?? false,
						},
						confirmationRequired: true,
						instruction:
							"To create this funnel, the user must explicitly confirm (e.g., 'yes', 'create it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				// User confirmed - create the funnel
				const result = await callRPCProcedure(
					"funnels",
					"create",
					{
						websiteId,
						name,
						description,
						steps,
						filters,
						ignoreHistoricData: ignoreHistoricData ?? false,
					},
					context
				);

				return {
					success: true,
					message: `Funnel "${name}" created successfully`,
					funnel: result,
				};
			} catch (error) {
				logger.error("Failed to create funnel", {
					websiteId,
					name,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to create funnel. Please try again.");
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
