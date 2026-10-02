import { successOutputSchema } from "../lib/schemas";
import { and, desc, eq, isNull, or } from "@databuddy/db";
import { annotations } from "@databuddy/db/schema";
import {
	annotationChartContextSchema,
	annotationCoordinateSchema,
} from "@databuddy/validation";
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

const annotationOutputSchema = z.object({
	annotationType: z.string(),
	chartContext: annotationChartContextSchema,
	chartType: z.string(),
	color: z.string(),
	createdAt: z.coerce.date(),
	createdBy: z.string().nullable(),
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
				chartContext: annotationChartContextSchema,
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
					const rows = await context.db
						.select()
						.from(annotations)
						.where(
							and(
								eq(annotations.websiteId, input.websiteId),
								eq(annotations.chartType, input.chartType),
								isNull(annotations.deletedAt),
								workspace.tier === "demo"
									? or(
											eq(annotations.isPublic, true),
											context.user
												? eq(annotations.createdBy, context.user.id)
												: undefined
										)
									: undefined
							)
						)
						.orderBy(desc(annotations.createdAt));

					if (workspace.tier !== "demo") {
						return rows;
					}
					return rows.map((row) =>
						context.user?.id === row.createdBy ? row : { ...row, createdBy: "" }
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
		.handler(async ({ context, input }) => {
			const annotationRow = await context.db.query.annotations.findFirst({
				where: { id: input.id, deletedAt: { isNull: true } },
				columns: {
					websiteId: true,
					isPublic: true,
					createdBy: true,
				},
			});

			if (!annotationRow) {
				throw rpcError.notFound("annotation", input.id);
			}

			const workspace = await withPublicWorkspace(context, {
				websiteId: annotationRow.websiteId,
				permissions: ["read"],
			});

			if (workspace.tier === "demo") {
				const isOwner = context.user?.id === annotationRow.createdBy;
				if (!(isOwner || annotationRow.isPublic)) {
					throw rpcError.notFound("annotation", input.id);
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
						throw rpcError.notFound("annotation", input.id);
					}
					return r;
				},
			});

			if (workspace.tier === "demo" && context.user?.id !== row.createdBy) {
				return { ...row, createdBy: "" };
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
			annotationCoordinateSchema.safeExtend({
				websiteId: z.string(),
				chartType: z.enum(["metrics"]),
				chartContext: annotationChartContextSchema,
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

			if (!newAnnotation) {
				throw rpcError.internal("Failed to create annotation");
			}

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
			const [annotation] = await context.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (!annotation) {
				throw rpcError.notFound("annotation", input.id);
			}

			await withWorkspace(context, {
				websiteId: annotation.websiteId,
				permissions: ["update"],
			});

			const { id, ...updates } = input;
			const [updatedAnnotation] = await context.db
				.update(annotations)
				.set({ ...updates, updatedAt: new Date() })
				.where(eq(annotations.id, id))
				.returning();

			if (!updatedAnnotation) {
				throw rpcError.notFound("annotation", id);
			}

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
			const [annotation] = await context.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

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
