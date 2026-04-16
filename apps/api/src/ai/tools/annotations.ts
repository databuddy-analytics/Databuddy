import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { callRPCProcedure, createToolLogger, getAppContext } from "./utils";

const logger = createToolLogger("Annotations Tools");

interface AnnotationRecord {
	annotationType: "point" | "line" | "range";
	color?: string | null;
	createdAt?: string;
	id: string;
	isPublic?: boolean;
	tags?: string[];
	text: string;
	updatedAt?: string;
	xEndValue?: string | null;
	xValue: string;
	yValue?: number | null;
}

const chartContextSchema = z.object({
	dateRange: z.object({
		start_date: z.string(),
		end_date: z.string(),
		granularity: z.enum(["hourly", "daily", "weekly", "monthly"]),
	}),
	filters: z
		.array(
			z.object({
				field: z.string(),
				operator: z.enum(["eq", "ne", "gt", "lt", "contains"]),
				value: z.string(),
			})
		)
		.optional(),
	metrics: z.array(z.string()).optional(),
	tabId: z.string().optional(),
});

export function createAnnotationTools() {
	const listAnnotationsTool = tool({
		description:
			"List annotations for a chart context (metadata, text, tags, timing).",
		inputSchema: z.object({
			websiteId: z.string(),
			chartType: z.enum(["metrics"]),
			chartContext: chartContextSchema,
		}),
		execute: async ({ websiteId, chartType, chartContext }, options) => {
			const context = getAppContext(options);
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

	const createAnnotationTool = tool({
		description:
			"Create a chart annotation. type=point (moment), line (vertical line), range (period — needs xEndValue). Timestamps ISO 8601.",
		inputSchema: z.object({
			websiteId: z.string(),
			chartType: z.enum(["metrics"]),
			chartContext: chartContextSchema,
			annotationType: z.enum(["point", "line", "range"]),
			xValue: z.string(),
			xEndValue: z.string().optional(),
			yValue: z.number().optional(),
			text: z.string().min(1).max(500),
			tags: z.array(z.string()).optional(),
			color: z.string().optional(),
			isPublic: z.boolean().optional(),
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		execute: async (
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
				isPublic,
				confirmed,
			},
			options
		) => {
			const context = getAppContext(options);
			try {
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

				if (annotationType === "range" && !xEndValue) {
					throw new Error(
						"Range annotations require an xEndValue to define the end of the time period."
					);
				}

				if (!confirmed) {
					const dateRangePreview = `${chartContext.dateRange.start_date} to ${chartContext.dateRange.end_date} (${chartContext.dateRange.granularity})`;

					return {
						preview: true,
						message:
							"Please review the annotation details below and confirm if you want to create it:",
						annotation: {
							websiteId,
							chartType,
							dateRange: dateRangePreview,
							annotationType,
							xValue,
							xEndValue,
							text,
							tags: tags ?? [],
							color: color || "#3B82F6",
							isPublic: isPublic ?? false,
						},
						confirmationRequired: true,
						instruction:
							"To create this annotation, the user must explicitly confirm (e.g., 'yes', 'create it', 'confirm'). Only then call this tool again with confirmed=true.",
					};
				}

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
		description: "Update annotation text, tags, color, or visibility.",
		inputSchema: z.object({
			id: z.string(),
			text: z.string().min(1).max(500).optional(),
			tags: z.array(z.string()).optional(),
			color: z.string().optional(),
			isPublic: z.boolean().optional(),
			confirmed: z.boolean().describe("false=preview, true=apply"),
		}),
		execute: async (
			{ id, text, tags, color, isPublic, confirmed },
			options
		) => {
			const context = getAppContext(options);
			try {
				if (!confirmed) {
					const currentAnnotation = (await callRPCProcedure(
						"annotations",
						"getById",
						{ id },
						context
					)) as AnnotationRecord;

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
		description: "Soft-delete an annotation.",
		inputSchema: z.object({
			id: z.string(),
			confirmed: z.boolean().describe("false=preview, true=delete"),
		}),
		execute: async ({ id, confirmed }, options) => {
			const context = getAppContext(options);
			try {
				if (!confirmed) {
					const annotation = (await callRPCProcedure(
						"annotations",
						"getById",
						{ id },
						context
					)) as AnnotationRecord;

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
		create_annotation: createAnnotationTool,
		update_annotation: updateAnnotationTool,
		delete_annotation: deleteAnnotationTool,
	} as const;
}
