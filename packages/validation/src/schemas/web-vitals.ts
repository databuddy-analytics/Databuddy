import z from "zod";
import { MAX_FUTURE_MS, MIN_TIMESTAMP, VALIDATION_LIMITS } from "../constants";

const timestampSchema = z
	.number()
	.int()
	.gte(MIN_TIMESTAMP)
	.nullable()
	.optional()
	.refine((val) => val == null || val <= Date.now() + MAX_FUTURE_MS, {
		message: "Timestamp too far in the future (max 1 hour ahead)",
	});

// Old format (v1.x): aggregated vitals in payload
export const webVitalsEventSchema = z.object({
	payload: z.object({
		eventId: z
			.string()
			.max(VALIDATION_LIMITS.ANONYMOUS_ID_MAX_LENGTH)
			.nullable()
			.optional(),
		anonymousId: z
			.string()
			.max(VALIDATION_LIMITS.ANONYMOUS_ID_MAX_LENGTH)
			.nullable()
			.optional(),
		sessionId: z
			.string()
			.max(VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH)
			.nullable()
			.optional(),
		timestamp: timestampSchema,
		path: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
		fcp: z
			.number()
			.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
			.nullable()
			.optional(),
		lcp: z
			.number()
			.max(VALIDATION_LIMITS.PERFORMANCE_MAX)
			.nullable()
			.optional(),
		cls: z.number().max(VALIDATION_LIMITS.CLS_MAX).nullable().optional(),
		fid: z.number().max(VALIDATION_LIMITS.FID_MAX).nullable().optional(),
		inp: z.number().max(VALIDATION_LIMITS.INP_MAX).nullable().optional(),
	}),
});

// New format (v2.x): individual vital metrics
const webVitalMetricNames = ["FCP", "LCP", "CLS", "INP", "TTFB", "FPS"] as const;

export const individualVitalSchema = z.object({
	timestamp: timestampSchema,
	path: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
	metricName: z.enum(webVitalMetricNames),
	metricValue: z.number(),
	anonymousId: z
		.string()
		.max(VALIDATION_LIMITS.ANONYMOUS_ID_MAX_LENGTH)
		.nullable()
		.optional(),
	sessionId: z
		.string()
		.max(VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH)
		.nullable()
		.optional(),
});

// Batched individual vitals (array of individual metrics)
export const batchedVitalsSchema = z.array(individualVitalSchema).max(20);

// Type exports
export type IndividualVital = z.infer<typeof individualVitalSchema>;
export type BatchedVitals = z.infer<typeof batchedVitalsSchema>;
