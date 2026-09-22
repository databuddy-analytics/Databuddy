import z from "zod";
import { MAX_FUTURE_MS, MIN_TIMESTAMP, VALIDATION_LIMITS } from "../constants";

const count = z.number().int().min(0).max(65_535);
const target = z.string().max(64);

export const exitTypes = ["navigation", "spa", "hidden", "unload"] as const;

export const engagementSpanSchema = z.object({
	eventId: z.string().max(VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH).optional(),
	timestamp: z
		.number()
		.int()
		.gte(MIN_TIMESTAMP)
		.refine((value) => value <= Date.now() + MAX_FUTURE_MS, {
			message: "Timestamp too far in the future (max 1 hour ahead)",
		}),
	path: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
	anonymousId: z
		.string()
		.max(VALIDATION_LIMITS.ANONYMOUS_ID_MAX_LENGTH)
		.nullable()
		.optional(),
	anonymizeVisitorIds: z
		.union([z.boolean(), z.literal("auto")])
		.nullable()
		.optional()
		.transform((value) => value ?? undefined),
	sessionId: z
		.string()
		.max(VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH)
		.nullable()
		.optional(),
	pageIndex: count,
	exitType: z.enum(exitTypes),
	timeOnPage: z
		.number()
		.int()
		.min(0)
		.max(86_400 * 7),
	activeTime: z
		.number()
		.int()
		.min(0)
		.max(86_400 * 7),
	timeToFirstInteraction: z.number().int().min(0).max(86_400_000),
	maxScrollDepth: z.number().int().min(0).max(100),
	scrollCount: count,
	clickCount: count,
	keyCount: count,
	interactionCount: count,
	copyCount: count,
	rageClickCount: count,
	deadClickCount: count,
	rageClickTarget: target,
	deadClickTarget: target,
	formFieldCount: count,
	formSubmitCount: count,
	lastFormField: target,
	errorCount: count,
});

export const batchedEngagementSchema = z.array(engagementSpanSchema).max(20);

export type EngagementSpan = z.infer<typeof engagementSpanSchema>;
