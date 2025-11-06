import z from "zod/v4";
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
