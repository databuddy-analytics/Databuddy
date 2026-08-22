import { annotationCoordinateSchema } from "@databuddy/validation";
import { z } from "zod";

export const chartContextSchema = z.object({
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

export const createAnnotationInputSchema =
	annotationCoordinateSchema.safeExtend({
		websiteId: z.string(),
		chartType: z.enum(["metrics"]),
		chartContext: chartContextSchema,
		yValue: z.number().optional(),
		text: z.string().min(1).max(500),
		tags: z.array(z.string()).optional(),
		color: z.string().optional(),
		isPublic: z.boolean().default(false),
	});
