import { and, annotations, desc, eq, isNull } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const annotationsCache = createDrizzleCache({
	redis,
	namespace: "annotations",
});
const CACHE_TTL = 300; // 5 minutes

// ============================================================================
// Schemas
// ============================================================================

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

const createAnnotationSchema = z.object({
	websiteId: z.string(),
	chartType: z.enum(["metrics"]),
	chartContext: chartContextSchema,
	annotationType: z.enum(["point", "line", "range"]),
	xValue: z.string(), // ISO timestamp
	xEndValue: z.string().optional(), // For range annotations
	yValue: z.number().optional(),
	text: z.string().min(1).max(500),
	tags: z.array(z.string()).optional(),
	color: z.string().optional(),
	isPublic: z.boolean().default(false),
});

const updateAnnotationSchema = z.object({
	id: z.string(),
	text: z.string().min(1).max(500).optional(),
	tags: z.array(z.string()).optional(),
	color: z.string().optional(),
	isPublic: z.boolean().optional(),
});

// ============================================================================
// Router
// ============================================================================

export const annotationsRouter = createTRPCRouter({
	// List annotations for a chart context
	list: publicProcedure
		.input(
			z.object({
				websiteId: z.string(),
				chartType: z.enum(["metrics"]),
				chartContext: chartContextSchema,
			})
		)
		.query(({ ctx, input }) => {
			const cacheKey = `annotations:list:${input.websiteId}:${input.chartType}`;

			return annotationsCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ["annotations"],
				queryFn: async () => {
					await authorizeWebsiteAccess(ctx, input.websiteId, "read");

					return ctx.db
						.select()
						.from(annotations)
						.where(
							and(
								eq(annotations.websiteId, input.websiteId),
								eq(annotations.chartType, input.chartType),
								isNull(annotations.deletedAt)
							)
						)
						.orderBy(desc(annotations.createdAt));
				},
			});
		}),

	// Get annotation by ID
	getById: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(({ ctx, input }) => {
			const cacheKey = `annotations:byId:${input.id}`;

			return annotationsCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ["annotations"],
				queryFn: async () => {
					const result = await ctx.db
						.select()
						.from(annotations)
						.where(
							and(eq(annotations.id, input.id), isNull(annotations.deletedAt))
						)
						.limit(1);

					if (result.length === 0) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Annotation not found",
						});
					}

					const annotation = result[0];
					if (!annotation) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Annotation not found",
						});
					}
					await authorizeWebsiteAccess(ctx, annotation.websiteId, "read");

					return annotation;
				},
			});
		}),

	// Create annotation
	create: protectedProcedure
		.input(createAnnotationSchema)
		.mutation(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, "update");

			const annotationId = crypto.randomUUID();
			const [newAnnotation] = await ctx.db
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
					createdBy: ctx.user.id,
				})
				.returning();

			await annotationsCache.invalidateByTables(["annotations"]);

			return newAnnotation;
		}),

	// Update annotation
	update: protectedProcedure
		.input(updateAnnotationSchema)
		.mutation(async ({ ctx, input }) => {
			// First verify the annotation exists and get website ID
			const existingAnnotation = await ctx.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (existingAnnotation.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Annotation not found",
				});
			}

			await authorizeWebsiteAccess(
				ctx,
				existingAnnotation[0].websiteId,
				"update"
			);

			const [updatedAnnotation] = await ctx.db
				.update(annotations)
				.set({
					...input,
					updatedAt: new Date(),
				})
				.where(eq(annotations.id, input.id))
				.returning();

			await annotationsCache.invalidateByTables(["annotations"]);

			return updatedAnnotation;
		}),

	// Delete annotation (soft delete)
	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			// First verify the annotation exists and get website ID
			const existingAnnotation = await ctx.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (existingAnnotation.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Annotation not found",
				});
			}

			await authorizeWebsiteAccess(
				ctx,
				existingAnnotation[0].websiteId,
				"update"
			);

			await ctx.db
				.update(annotations)
				.set({ deletedAt: new Date() })
				.where(eq(annotations.id, input.id));

			await annotationsCache.invalidateByTables(["annotations"]);

			return { success: true };
		}),
});
