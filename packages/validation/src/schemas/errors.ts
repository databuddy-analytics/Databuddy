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

// Old format (v1.x): wrapped in payload
export const errorEventSchema = z.object({
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
		message: z.string().max(VALIDATION_LIMITS.MESSAGE_MAX_LENGTH),
		filename: z
			.string()
			.max(VALIDATION_LIMITS.FILENAME_MAX_LENGTH)
			.nullable()
			.optional(),
		lineno: z
			.number()
			.int()
			.max(VALIDATION_LIMITS.LINENO_MAX)
			.nullable()
			.optional(),
		colno: z
			.number()
			.int()
			.max(VALIDATION_LIMITS.COLNO_MAX)
			.nullable()
			.optional(),
		stack: z
			.string()
			.max(VALIDATION_LIMITS.STACK_MAX_LENGTH)
			.nullable()
			.optional(),
		errorType: z
			.string()
			.max(VALIDATION_LIMITS.ERROR_TYPE_MAX_LENGTH)
			.nullable()
			.optional(),
	}),
});

// New format (v2.x): lean error spans
export const errorSpanSchema = z.object({
	timestamp: timestampSchema,
	path: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
	message: z.string().max(VALIDATION_LIMITS.MESSAGE_MAX_LENGTH),
	filename: z
		.string()
		.max(VALIDATION_LIMITS.FILENAME_MAX_LENGTH)
		.nullable()
		.optional(),
	lineno: z
		.number()
		.int()
		.max(VALIDATION_LIMITS.LINENO_MAX)
		.nullable()
		.optional(),
	colno: z
		.number()
		.int()
		.max(VALIDATION_LIMITS.COLNO_MAX)
		.nullable()
		.optional(),
	stack: z
		.string()
		.max(VALIDATION_LIMITS.STACK_MAX_LENGTH)
		.nullable()
		.optional(),
	errorType: z
		.string()
		.max(VALIDATION_LIMITS.ERROR_TYPE_MAX_LENGTH)
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
});

export const batchedErrorsSchema = z.array(errorSpanSchema).max(50);

export type ErrorSpan = z.infer<typeof errorSpanSchema>;
export type BatchedErrors = z.infer<typeof batchedErrorsSchema>;
