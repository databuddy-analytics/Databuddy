import { ORPCError } from "@orpc/server";
import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { getServerRPCClient } from "../../lib/orpc-server";
import type { AppContext } from "../config/context";
import { createToolLogger } from "./utils/logger";

const logger = createToolLogger("Funnels Tools");

async function callRPCProcedure(
	routerName: string,
	method: string,
	input: unknown,
	context: AppContext
) {
	try {
		const headers = context.requestHeaders ?? new Headers();
		const client = await getServerRPCClient(headers);

		const router = client[routerName as keyof typeof client] as
			| Record<string, (input: unknown) => Promise<unknown>>
			| undefined;
		if (!router || typeof router !== "object") {
			throw new Error(`Router ${routerName} not found`);
		}

		const clientFn = router[method];
		if (typeof clientFn !== "function") {
			throw new Error(
				`Procedure ${routerName}.${method} not found or not callable.`
			);
		}

		return await clientFn(input);
	} catch (error) {
		if (error instanceof ORPCError) {
			logger.error("ORPC error", {
				procedure: `${routerName}.${method}`,
				code: error.code,
				message: error.message,
			});

			const userMessage =
				error.code === "UNAUTHORIZED"
					? "You don't have permission to perform this action."
					: error.code === "NOT_FOUND"
						? "The requested resource was not found."
						: error.code === "BAD_REQUEST"
							? `Invalid request: ${error.message}`
							: error.code === "FORBIDDEN"
								? "You don't have permission to access this resource."
								: error.message ||
								"An error occurred while processing your request.";

			throw new Error(userMessage);
		}

		if (error instanceof Error) {
			logger.error("RPC call error", {
				procedure: `${routerName}.${method}`,
				error: error.message,
				stack: error.stack,
				input,
			});
			throw error;
		}

		logger.error("Unknown error in RPC call", {
			procedure: `${routerName}.${method}`,
			error,
			input,
		});
		throw new Error("An unexpected error occurred. Please try again.");
	}
}

export function createFunnelTools(context: AppContext) {
	const listFunnelsTool = tool({
		description:
			"List all funnels for a website. Returns funnels with their steps, filters, and metadata.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID to get funnels for"),
		}),
		execute: async ({ websiteId }) => {
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

	const getFunnelByIdTool = tool({
		description:
			"Get a specific funnel by ID. Returns detailed information including steps, filters, and configuration.",
		inputSchema: z.object({
			id: z.string().describe("The funnel ID"),
			websiteId: z.string().describe("The website ID"),
		}),
		execute: async ({ id, websiteId }) => {
			try {
				return await callRPCProcedure(
					"funnels",
					"getById",
					{ id, websiteId },
					context
				);
			} catch (error) {
				logger.error("Failed to get funnel by ID", { id, websiteId, error });
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve funnel. Please try again.");
			}
		},
	});

	const getFunnelAnalyticsTool = tool({
		description:
			"Get analytics data for a funnel. Returns conversion rates, drop-off points, and step-by-step metrics.",
		inputSchema: z.object({
			funnelId: z.string().describe("The funnel ID"),
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
		execute: async ({ funnelId, websiteId, startDate, endDate }) => {
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
			"Get funnel analytics broken down by referrer/traffic source. Shows which sources drive the best conversions.",
		inputSchema: z.object({
			funnelId: z.string().describe("The funnel ID"),
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
		execute: async ({ funnelId, websiteId, startDate, endDate }) => {
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
			"Create a new funnel to track a user journey. REQUIRES EXPLICIT USER CONFIRMATION before creating. Always show a preview first and ask the user to confirm before setting confirmed=true.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID"),
			name: z
				.string()
				.min(1)
				.max(100)
				.describe("The funnel name (1-100 characters)"),
			description: z
				.string()
				.optional()
				.describe("Optional description of the funnel"),
			steps: z
				.array(
					z.object({
						type: z
							.enum(["PAGE_VIEW", "EVENT", "CUSTOM"])
							.describe("Step type: PAGE_VIEW for page paths, EVENT for custom events"),
						target: z
							.string()
							.min(1)
							.describe(
								"Step target: page path (e.g., '/signup') or event name (e.g., 'button_click')"
							),
						name: z
							.string()
							.min(1)
							.describe("Human-readable step name (e.g., 'Sign Up Page', 'Add to Cart')"),
						conditions: z
							.record(z.string(), z.unknown())
							.optional()
							.describe("Optional conditions for the step"),
					})
				)
				.min(2)
				.max(10)
				.describe(
					"Array of funnel steps (minimum 2, maximum 10). Steps define the user journey path."
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
				.describe("Optional filters to apply to the funnel"),
			ignoreHistoricData: z
				.boolean()
				.optional()
				.describe(
					"Whether to ignore historic data before funnel creation (default: false)"
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
			steps,
			filters,
			ignoreHistoricData,
			confirmed,
		}) => {
			try {
				// If not confirmed, return preview and ask for confirmation
				if (!confirmed) {
					const stepsPreview = steps
						.map((step, index) => `${index + 1}. ${step.name} (${step.type}: ${step.target})`)
						.join("\n");
					const filtersPreview = filters && filters.length > 0
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
		get_funnel_by_id: getFunnelByIdTool,
		get_funnel_analytics: getFunnelAnalyticsTool,
		get_funnel_analytics_by_referrer: getFunnelAnalyticsByReferrerTool,
		create_funnel: createFunnelTool,
	} as const;
}
