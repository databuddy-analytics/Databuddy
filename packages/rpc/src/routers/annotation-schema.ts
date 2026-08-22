import {
	annotationChartContextSchema,
	annotationCoordinateSchema,
} from "@databuddy/validation";
import { z } from "zod";

export const createAnnotationInputSchema =
	annotationCoordinateSchema.safeExtend({
		websiteId: z.string(),
		chartType: z.enum(["metrics"]),
		chartContext: annotationChartContextSchema,
		yValue: z.number().optional(),
		text: z.string().min(1).max(500),
		tags: z.array(z.string()).optional(),
		color: z.string().optional(),
		isPublic: z.boolean().default(false),
	});
