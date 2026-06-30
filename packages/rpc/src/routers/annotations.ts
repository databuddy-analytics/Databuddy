import { and, desc, eq, isNull, or, type SQL } from "@databuddy/db";
import { annotations } from "@databuddy/db/schema";
import {
	createDrizzleCache,
	invalidateAgentContextSnapshotsForWebsite,
	redis,
} from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { setTrackProperties } from "../middleware/track-mutation";
import { type Context, publicProcedure, trackedProcedure } from "../orpc";
import {
	type Workspace,
	withPublicWorkspace,
	withWorkspace,
} from "../procedures/with-workspace";
import { scopedCacheKey } from "../utils/scoped-cache-key";

function annotationViewerSlot(workspace: Workspace, context: Context): string {
	if (workspace.tier === "authed") {
		return "authed";
	}
	if (context.apiKey) {
		return `apikey:${context.apiKey.id}`;
	}
	if (context.user) {
		return `user:${context.user.id}`;
	}
	return "anon";
}

const annotationsCache = createDrizzleCache({
	redis,
	namespace: "annotations",
});
const CACHE_TTL = 300;

async function invalidateAnnotationCaches(websiteId: string): Promise<void> {
	await Promise.all([
		annotationsCache.invalidateByTables(["annotations"]),
		invalidateAgentContextSnapshotsForWebsite(websiteId),
	]);
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

const annotationOutputSchema = z.object({
	annotationType: z.string(),
	chartContext: z.unknown(),
	chartType: z.string(),
	color: z.string(),
	createdAt: z.coerce.date(),
	createdBy: z.string(),
	deletedAt: z.nullable(z.coerce.date()),
	id: z.string(),
	isPublic: z.boolean(),
	tags: z.array(z.string()).nullable(),
	text: z.string(),
	updatedAt: z.coerce.date(),
	websiteId: z.string(),
	xEndValue: z.nullable(z.coerce.date()),
	xValue: z.coerce.date(),
	yValue: z.number().nullable(),
});

const successOutputSchema = z.object({ success: z.literal(true) });

interface AnnotationWithCreator {
	createdBy?: unknown;
	[key: string]: unknown;
}

function sanitizeAnnotationForDemo<T extends AnnotationWithCreator>(row: T): T {
	return { ...row, createdBy: "" };
}

export const annotationsRouter = {
	list: publicProcedure
		.route({
			description:
				"Returns annotations for a chart context. Requires website read permission.",
			method: "POST",
			path: "/annotations/list",
			summary: "List annotations",
			tags: ["Annotations"],
		})
		.input(
			z.object({
				websiteId: z.string(),
				chartType: z.enum(["metrics"]),
				chartContext: chartContextSchema,
			})
		)
		.output(z.array(annotationOutputSchema))
		.handler(async ({ context, input }) => {
			const workspace = await withPublicWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			const viewerSlot = annotationViewerSlot(workspace, context);

			return annotationsCache.withCache({
				key: scopedCacheKey(
					"list",
					workspace,
					`website:${input.websiteId}`,
					`viewer:${viewerSlot}`,
					`chart:${input.chartType}`
				),
				ttl: CACHE_TTL,
				tables: ["annotations"],
				queryFn: async () => {
					const baseConditions = [
						eq(annotations.websiteId, input.websiteId),
						eq(annotations.chartType, input.chartType),
						isNull(annotations.deletedAt),
					];

					let visibilityCondition: SQL<unknown> | undefined;
					if (workspace.tier === "demo") {
						visibilityCondition = context.user
							? or(
									eq(annotations.isPublic, true),
									eq(annotations.createdBy, context.user.id)
								)
							: eq(annotations.isPublic, true);
					}

					const whereCondition = visibilityCondition
						? and(...baseConditions, visibilityCondition)
						: and(...baseConditions);

					const rows = await context.db
						.select()
						.from(annotations)
						.where(whereCondition)
						.orderBy(desc(annotations.createdAt));

					if (workspace.tier !== "demo") {
						return rows;
					}
					return rows.map((row) =>
						context.user?.id === row.createdBy
							? row
							: sanitizeAnnotationForDemo(row)
					);
				},
			});
		}),

	getById: publicProcedure
		.route({
			description:
				"Returns a single annotation by id. Requires website read permission.",
			method: "POST",
			path: "/annotations/getById",
			summary: "Get annotation",
			tags: ["Annotations"],
		})
		.input(z.object({ id: z.string() }))
		.output(annotationOutputSchema)
		.handler(async ({ context, input, errors }) => {
			const annotationRow = await context.db.query.annotations.findFirst({
				where: { id: input.id, deletedAt: { isNull: true } },
				columns: {
					websiteId: true,
					isPublic: true,
					createdBy: true,
				},
			});

			if (!annotationRow) {
				throw errors.NOT_FOUND({
					message: "Annotation not found",
					data: { resourceType: "annotation", resourceId: input.id },
				});
			}

			const workspace = await withPublicWorkspace(context, {
				websiteId: annotationRow.websiteId,
				permissions: ["read"],
			});

			if (workspace.tier === "demo") {
				const isOwner = context.user?.id === annotationRow.createdBy;
				if (!(isOwner || annotationRow.isPublic)) {
					throw errors.NOT_FOUND({
						message: "Annotation not found",
						data: { resourceType: "annotation", resourceId: input.id },
					});
				}
			}

			const row = await annotationsCache.withCache({
				key: scopedCacheKey(
					"byId",
					workspace,
					`website:${annotationRow.websiteId}`,
					`id:${input.id}`
				),
				ttl: CACHE_TTL,
				tables: ["annotations"],
				queryFn: async () => {
					const r = await context.db.query.annotations.findFirst({
						where: { id: input.id, deletedAt: { isNull: true } },
					});
					if (!r) {
						throw errors.NOT_FOUND({
							message: "Annotation not found",
							data: { resourceType: "annotation", resourceId: input.id },
						});
					}
					return r;
				},
			});

			if (workspace.tier === "demo" && context.user?.id !== row.createdBy) {
				return sanitizeAnnotationForDemo(row);
			}
			return row;
		}),

	create: trackedProcedure
		.route({
			description:
				"Creates a new annotation. Requires website update permission.",
			method: "POST",
			path: "/annotations/create",
			summary: "Create annotation",
			tags: ["Annotations"],
		})
		.input(
			z.object({
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
				isPublic: z.boolean().default(false),
			})
		)
		.output(annotationOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({ type: input.annotationType });
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["update"],
			});

			const createdBy = await workspace.getCreatedBy();

			const annotationId = randomUUIDv7();
			const [newAnnotation] = await context.db
				.insert(annotations)
				.values({
					id: annotationId,
					websiteId: input.websiteId,
					chartType: input.chartType,
					chartContext: input.chartContext,
					annotationType: input.annotationType,
					xValue: new Date(input.xValue),
					xEndValue: input.xEndValue ? new Date(input.xEndValue) : null,
					yValue: input.yValue,
					text: input.text,
					tags: input.tags || [],
					color: input.color || "#3B82F6",
					isPublic: input.isPublic,
					createdBy,
				})
				.returning();

			await invalidateAnnotationCaches(input.websiteId);

			return newAnnotation;
		}),

	update: trackedProcedure
		.route({
			description:
				"Updates an annotation. Users can only update their own unless they own the website.",
			method: "POST",
			path: "/annotations/update",
			summary: "Update annotation",
			tags: ["Annotations"],
		})
		.input(
			z.object({
				id: z.string(),
				text: z.string().min(1).max(500).optional(),
				tags: z.array(z.string()).optional(),
				color: z.string().optional(),
				isPublic: z.boolean().optional(),
			})
		)
		.output(annotationOutputSchema)
		.handler(async ({ context, input }) => {
			const existingAnnotation = await context.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (existingAnnotation.length === 0) {
				throw rpcError.notFound("annotation", input.id);
			}

			const annotation = existingAnnotation[0];
			if (!annotation) {
				throw rpcError.notFound("annotation", input.id);
			}

			await withWorkspace(context, {
				websiteId: annotation.websiteId,
				permissions: ["update"],
			});

			const updateData: {
				text?: string;
				tags?: string[];
				color?: string;
				isPublic?: boolean;
				updatedAt: Date;
			} = { updatedAt: new Date() };
			if (input.text !== undefined) {
				updateData.text = input.text;
			}
			if (input.tags !== undefined) {
				updateData.tags = input.tags;
			}
			if (input.color !== undefined) {
				updateData.color = input.color;
			}
			if (input.isPublic !== undefined) {
				updateData.isPublic = input.isPublic;
			}

			const [updatedAnnotation] = await context.db
				.update(annotations)
				.set(updateData)
				.where(eq(annotations.id, input.id))
				.returning();

			await invalidateAnnotationCaches(annotation.websiteId);

			return updatedAnnotation;
		}),

	delete: trackedProcedure
		.route({
			description:
				"Soft-deletes an annotation. Users can only delete their own unless they own the website.",
			method: "POST",
			path: "/annotations/delete",
			summary: "Delete annotation",
			tags: ["Annotations"],
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const existingAnnotation = await context.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (existingAnnotation.length === 0) {
				throw rpcError.notFound("annotation", input.id);
			}

			const annotation = existingAnnotation[0];
			if (!annotation) {
				throw rpcError.notFound("annotation", input.id);
			}

			await withWorkspace(context, {
				websiteId: annotation.websiteId,
				permissions: ["delete"],
			});

			await context.db
				.update(annotations)
				.set({ deletedAt: new Date() })
				.where(eq(annotations.id, input.id));

			await invalidateAnnotationCaches(annotation.websiteId);

			return { success: true };
		}),
};
