import { ORPCError } from "@orpc/server";
import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { getServerRPCClient } from "../../lib/orpc-server";
import type { AppContext } from "../config/context";
import { createToolLogger } from "./utils/logger";

const logger = createToolLogger("Annotations Tools");

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

const chartContextSchema = z.object({
	dateRange: z.object({
		start_date: z.string().describe("Start date in YYYY-MM-DD format"),
		end_date: z.string().describe("End date in YYYY-MM-DD format"),
		granularity: z
			.enum(["hourly", "daily", "weekly", "monthly"])
			.describe("Time granularity for the chart"),
	}),
	filters: z
		.array(
			z.object({
				field: z.string().describe("Filter field name"),
				operator: z
					.enum(["eq", "ne", "gt", "lt", "contains"])
					.describe("Filter operator"),
				value: z.string().describe("Filter value"),
			})
		)
		.optional()
		.describe("Optional filters to apply to the chart"),
	metrics: z
		.array(z.string())
		.optional()
		.describe("Optional array of metric names"),
	tabId: z.string().optional().describe("Optional tab ID for the chart"),
});

export function createAnnotationTools(context: AppContext) {
	const listAnnotationsTool = tool({
		description:
			"List all annotations for a website and chart context. Returns annotations with their metadata, text, tags, and timing information.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID to get annotations for"),
			chartType: z
				.enum(["metrics"])
				.describe("The type of chart (currently only 'metrics' is supported)"),
			chartContext: chartContextSchema.describe(
				"The chart context including date range, filters, and metrics"
			),
		}),
		execute: async ({ websiteId, chartType, chartContext }) => {
			try {
				const result = await callRPCProcedure(
					"annotations",
					"list",
					{ websiteId, chartType, chartContext },
					context
				);
				return {
					annotations: result,
					count: Array.isArray(result) ? result.length : 0,
				};
			} catch (error) {
				logger.error("Failed to list annotations", {
					websiteId,
					chartType,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve annotations. Please try again.");
			}
		},
	});

	const getAnnotationByIdTool = tool({
		description:
			"Get a specific annotation by ID. Returns detailed information including text, tags, color, timing, and chart context.",
		inputSchema: z.object({
			id: z.string().describe("The annotation ID"),
		}),
		execute: async ({ id }) => {
			try {
				return await callRPCProcedure(
					"annotations",
					"getById",
					{ id },
					context
				);
			} catch (error) {
				logger.error("Failed to get annotation by ID", { id, error });
				throw error instanceof Error
					? error
					: new Error("Failed to retrieve annotation. Please try again.");
			}
		},
	});

	const createAnnotationTool = tool({
		description:
			"Create a new annotation on a chart. Annotations mark important events or periods on charts. REQUIRES EXPLICIT USER CONFIRMATION before creating. Always show a preview first and ask the user to confirm before setting confirmed=true.",
		inputSchema: z.object({
			websiteId: z.string().describe("The website ID"),
			chartType: z
				.enum(["metrics"])
				.describe("The type of chart (currently only 'metrics' is supported)"),
			chartContext: chartContextSchema.describe(
				"The chart context including date range, filters, and metrics"
			),
			annotationType: z
				.enum(["point", "line", "range"])
				.describe(
					"Type of annotation: 'point' for a single moment, 'line' for a vertical line, 'range' for a time period"
				),
			xValue: z
				.string()
				.describe(
					"X-axis value (timestamp) in ISO 8601 format (e.g., '2024-01-15T10:30:00Z')"
				),
			xEndValue: z
				.string()
				.optional()
				.describe(
					"End X-axis value for range annotations in ISO 8601 format (required for 'range' type)"
				),
			yValue: z
				.number()
				.optional()
				.describe("Optional Y-axis value for point annotations"),
			text: z
				.string()
				.min(1)
				.max(500)
				.describe("Annotation text (1-500 characters)"),
			tags: z
				.array(z.string())
				.optional()
				.describe("Optional array of tags for categorizing the annotation"),
			color: z
				.string()
				.optional()
				.describe(
					"Optional color in hex format (e.g., '#3B82F6'). Defaults to blue."
				),
			isPublic: z
				.boolean()
				.optional()
				.describe(
					"Whether the annotation is public (visible to all team members). Defaults to false."
				),
			confirmed: z
				.boolean()
				.describe(
					"CRITICAL: Must be false initially. Only set to true after user explicitly confirms. When false, returns a preview and asks for confirmation."
				),
		}),
		execute: async ({
			websiteId,
			chartType,
			chartContext,
			annotationType,
			xValue,
			xEndValue,
			yValue,
			text,
			tags,
			color,
			isPublic,
			confirmed,
		}) => {
			try {
				// Validate date format
				if (!dayjs(xValue).isValid()) {
					throw new Error(
						"xValue must be a valid ISO 8601 date string (e.g., '2024-01-15T10:30:00Z')."
					);
				}
				if (xEndValue && !dayjs(xEndValue).isValid()) {
					throw new Error(
						"xEndValue must be a valid ISO 8601 date string (e.g., '2024-01-15T10:30:00Z')."
					);
				}

				// Validate range annotations have end value
				if (annotationType === "range" && !xEndValue) {
					throw new Error(
						"Range annotations require an xEndValue to define the end of the time period."
					);
				}

				// If not confirmed, return preview and ask for confirmation
				if (!confirmed) {
					const dateRangePreview = `${chartContext.dateRange.start_date} to ${chartContext.dateRange.end_date} (${chartContext.dateRange.granularity})`;
					const typePreview =
						annotationType === "range"
							? `${annotationType} from ${xValue} to ${xEndValue}`
							: annotationType === "point"
								? `${annotationType} at ${xValue}${yValue ? ` (y: ${yValue})` : ""}`
								: `${annotationType} at ${xValue}`;

					return {
						preview: true,
						message:
							"Please review the annotation details below and confirm if you want to create it:",
						annotation: {
							websiteId,
							chartType,
							dateRange: dateRangePreview,
							type: typePreview,
							text,
							tags: tags && tags.length > 0 ? tags.join(", ") : "None",
							color: color || "#3B82F6",
							isPublic: isPublic ?? false,
						},
						confirmationRequired: true,
						instruction:
							"To create this annotation, the user must explicitly confirm (e.g., 'yes', 'create it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				// User confirmed - create the annotation
				const result = await callRPCProcedure(
					"annotations",
					"create",
					{
						websiteId,
						chartType,
						chartContext,
						annotationType,
						xValue,
						xEndValue,
						yValue,
						text,
						tags,
						color,
						isPublic: isPublic ?? false,
					},
					context
				);

				return {
					success: true,
					message: `Annotation "${text}" created successfully`,
					annotation: result,
				};
			} catch (error) {
				logger.error("Failed to create annotation", {
					websiteId,
					chartType,
					text,
					error,
				});
				throw error instanceof Error
					? error
					: new Error("Failed to create annotation. Please try again.");
			}
		},
	});

	const updateAnnotationTool = tool({
		description:
			"Update an existing annotation. Can update text, tags, color, and visibility. REQUIRES EXPLICIT USER CONFIRMATION before updating. Always show a preview first and ask the user to confirm before setting confirmed=true.",
		inputSchema: z.object({
			id: z.string().describe("The annotation ID to update"),
			text: z
				.string()
				.min(1)
				.max(500)
				.optional()
				.describe("Updated annotation text (1-500 characters)"),
			tags: z.array(z.string()).optional().describe("Updated array of tags"),
			color: z
				.string()
				.optional()
				.describe("Updated color in hex format (e.g., '#3B82F6')"),
			isPublic: z
				.boolean()
				.optional()
				.describe("Updated visibility (public or private)"),
			confirmed: z
				.boolean()
				.describe(
					"CRITICAL: Must be false initially. Only set to true after user explicitly confirms. When false, returns a preview and asks for confirmation."
				),
		}),
		execute: async ({ id, text, tags, color, isPublic, confirmed }) => {
			try {
				if (!confirmed) {
					const currentAnnotation = await callRPCProcedure(
						"annotations",
						"getById",
						{ id },
						context
					);

					if (!currentAnnotation) {
						throw new Error("Annotation not found");
					}

					const updates: string[] = [];
					if (text !== undefined && text !== currentAnnotation.text) {
						updates.push(`Text: "${currentAnnotation.text}" → "${text}"`);
					}
					if (tags !== undefined) {
						const currentTags = currentAnnotation.tags || [];
						const tagsChanged =
							JSON.stringify(currentTags.sort()) !==
							JSON.stringify(tags.sort());
						if (tagsChanged) {
							updates.push(
								`Tags: [${currentTags.join(", ") || "none"}] → [${tags.join(", ") || "none"}]`
							);
						}
					}
					if (color !== undefined && color !== currentAnnotation.color) {
						updates.push(`Color: ${currentAnnotation.color} → ${color}`);
					}
					if (
						isPublic !== undefined &&
						isPublic !== currentAnnotation.isPublic
					) {
						updates.push(
							`Visibility: ${currentAnnotation.isPublic ? "public" : "private"} → ${isPublic ? "public" : "private"}`
						);
					}

					if (updates.length === 0) {
						return {
							preview: true,
							message:
								"No changes detected. The annotation will remain unchanged.",
							annotation: currentAnnotation,
							confirmationRequired: false,
						};
					}

					return {
						preview: true,
						message:
							"Please review the changes below and confirm if you want to update the annotation:",
						current: {
							text: currentAnnotation.text,
							tags: currentAnnotation.tags || [],
							color: currentAnnotation.color,
							isPublic: currentAnnotation.isPublic,
						},
						changes: updates,
						confirmationRequired: true,
						instruction:
							"To update this annotation, the user must explicitly confirm (e.g., 'yes', 'update it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				// User confirmed - update the annotation
				const updateData: {
					id: string;
					text?: string;
					tags?: string[];
					color?: string;
					isPublic?: boolean;
				} = { id };

				if (text !== undefined) {
					updateData.text = text;
				}
				if (tags !== undefined) {
					updateData.tags = tags;
				}
				if (color !== undefined) {
					updateData.color = color;
				}
				if (isPublic !== undefined) {
					updateData.isPublic = isPublic;
				}

				const result = await callRPCProcedure(
					"annotations",
					"update",
					updateData,
					context
				);

				return {
					success: true,
					message: "Annotation updated successfully",
					annotation: result,
				};
			} catch (error) {
				logger.error("Failed to update annotation", { id, error });
				throw error instanceof Error
					? error
					: new Error("Failed to update annotation. Please try again.");
			}
		},
	});

	const deleteAnnotationTool = tool({
		description:
			"Delete an annotation (soft delete). REQUIRES EXPLICIT USER CONFIRMATION before deleting. Always show a preview first and ask the user to confirm before setting confirmed=true.",
		inputSchema: z.object({
			id: z.string().describe("The annotation ID to delete"),
			confirmed: z
				.boolean()
				.describe(
					"CRITICAL: Must be false initially. Only set to true after user explicitly confirms. When false, returns a preview and asks for confirmation."
				),
		}),
		execute: async ({ id, confirmed }) => {
			try {
				// If not confirmed, get annotation and show preview
				if (!confirmed) {
					const annotation = await callRPCProcedure(
						"annotations",
						"getById",
						{ id },
						context
					);

					return {
						preview: true,
						message: "Please confirm if you want to delete this annotation:",
						annotation: {
							id: annotation.id,
							text: annotation.text,
							type: annotation.annotationType,
							date: annotation.xValue,
						},
						confirmationRequired: true,
						instruction:
							"To delete this annotation, the user must explicitly confirm (e.g., 'yes', 'delete it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

				// User confirmed - delete the annotation
				const result = await callRPCProcedure(
					"annotations",
					"delete",
					{ id },
					context
				);

				return {
					success: true,
					message: "Annotation deleted successfully",
					result,
				};
			} catch (error) {
				logger.error("Failed to delete annotation", { id, error });
				throw error instanceof Error
					? error
					: new Error("Failed to delete annotation. Please try again.");
			}
		},
	});

	return {
		list_annotations: listAnnotationsTool,
		get_annotation_by_id: getAnnotationByIdTool,
		create_annotation: createAnnotationTool,
		update_annotation: updateAnnotationTool,
		delete_annotation: deleteAnnotationTool,
	} as const;
}
