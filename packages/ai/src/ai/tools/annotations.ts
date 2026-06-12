import { tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import type { AppContext } from "../config/context";
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

const chartTypeSchema = z.enum(["metrics"]);
const annotationTypeSchema = z.enum(["point", "line", "range"]);

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

const isoDateSchema = z.string().refine((value) => dayjs(value).isValid(), {
	message:
		"Must be a valid ISO 8601 date string (e.g., '2024-01-15T10:30:00Z').",
});

const createAnnotationInputSchema = z
	.object({
		websiteId: z.string(),
		chartType: chartTypeSchema,
		chartContext: chartContextSchema,
		annotationType: annotationTypeSchema,
		xValue: isoDateSchema,
		xEndValue: isoDateSchema.optional(),
		yValue: z.number().optional(),
		text: z.string().min(1).max(500),
		tags: z.array(z.string()).optional(),
		color: z.string().optional(),
		isPublic: z.boolean().optional(),
		confirmed: z.boolean().describe("false=preview, true=apply"),
	})
	.refine((input) => input.annotationType !== "range" || input.xEndValue, {
		message:
			"Range annotations require an xEndValue to define the end of the time period.",
		path: ["xEndValue"],
	});

const listAnnotationsInputSchema = z.object({
	websiteId: z.string(),
	chartType: chartTypeSchema,
	chartContext: chartContextSchema,
});
const updateAnnotationInputSchema = createAnnotationInputSchema
	.pick({
		text: true,
		tags: true,
		color: true,
		isPublic: true,
		confirmed: true,
	})
	.partial({ text: true, tags: true, color: true, isPublic: true })
	.extend({ id: z.string() });
const deleteAnnotationInputSchema = z.object({
	id: z.string(),
	confirmed: z.boolean().describe("false=preview, true=delete"),
});

/**
 * The insights agent receives the website domain (e.g. "example.com") as its
 * primary identifier, so LLMs routinely pass a domain name where the backend
 * expects a UUID.  This helper maps a domain name back to the UUID that the RPC
 * layer understands, using the app context that is injected at agent run time.
 */
function resolveWebsiteId(ctx: AppContext, inputId: string): string {
	// Direct match against context UUID — already correct.
	if (inputId === ctx.websiteId || inputId === ctx.defaultWebsiteId) {
		return inputId;
	}
	// Input is the context domain → return the context UUID.
	if (ctx.websiteDomain && inputId === ctx.websiteDomain && ctx.websiteId) {
		return ctx.websiteId;
	}
	// Input matches an accessible website's domain → return its UUID.
	const byDomain = (ctx.accessibleWebsites ?? []).find(
		(w) => w.domain === inputId
	);
	if (byDomain) {
		return byDomain.id;
	}
	// Pass through — might already be a valid UUID or will fail at the RPC layer.
	return inputId;
}

export function createAnnotationTools() {
	const listAnnotationsTool = tool({
		description:
			"List annotations for a chart context (metadata, text, tags, timing).",
		inputSchema: listAnnotationsInputSchema,
		execute: async ({ websiteId, chartType, chartContext }, options) => {
			const context = getAppContext(options);
			const resolvedWebsiteId = resolveWebsiteId(context, websiteId);
			try {
				const result = await callRPCProcedure(
					"annotations",
					"list",
					{ websiteId: resolvedWebsiteId, chartType, chartContext },
					context
				);
				return {
					annotations: result,
					count: Array.isArray(result) ? result.length : 0,
				};
			} catch (error) {
				logger.error("Failed to list annotations", {
					websiteId: resolvedWebsiteId,
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
		inputSchema: createAnnotationInputSchema,
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
			const resolvedWebsiteId = resolveWebsiteId(context, websiteId);
			try {
				if (!confirmed) {
					const dateRangePreview = `${chartContext.dateRange.start_date} to ${chartContext.dateRange.end_date} (${chartContext.dateRange.granularity})`;

					return {
						preview: true,
						message:
							"Please review the annotation details below and confirm if you want to create it:",
						annotation: {
							websiteId: resolvedWebsiteId,
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
						websiteId: resolvedWebsiteId,
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
					websiteId: resolvedWebsiteId,
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
		inputSchema: updateAnnotationInputSchema,
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

					const updates = buildAnnotationChanges(currentAnnotation, {
						text,
						tags,
						color,
						isPublic,
					});

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

				const result = await callRPCProcedure(
					"annotations",
					"update",
					omitUndefined({ id, text, tags, color, isPublic }),
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
		inputSchema: deleteAnnotationInputSchema,
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

interface AnnotationUpdates {
	color?: string;
	isPublic?: boolean;
	tags?: string[];
	text?: string;
}

function buildAnnotationChanges(
	current: AnnotationRecord,
	updates: AnnotationUpdates
): string[] {
	const changes: string[] = [];

	if (updates.text !== undefined && updates.text !== current.text) {
		changes.push(`Text: "${current.text}" → "${updates.text}"`);
	}
	if (updates.tags !== undefined) {
		const currentTags = current.tags || [];
		if (
			JSON.stringify([...currentTags].sort()) !==
			JSON.stringify([...updates.tags].sort())
		) {
			changes.push(
				`Tags: [${currentTags.join(", ") || "none"}] → [${updates.tags.join(", ") || "none"}]`
			);
		}
	}
	if (updates.color !== undefined && updates.color !== current.color) {
		changes.push(`Color: ${current.color} → ${updates.color}`);
	}
	if (updates.isPublic !== undefined && updates.isPublic !== current.isPublic) {
		changes.push(
			`Visibility: ${current.isPublic ? "public" : "private"} → ${updates.isPublic ? "public" : "private"}`
		);
	}

	return changes;
}

function omitUndefined(
	input: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined)
	);
}
