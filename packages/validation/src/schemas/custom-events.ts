import z from "zod";
import { VALIDATION_LIMITS } from "../constants";

// Legacy schema
export const customEventSchema = z.object({
	eventId: z.string().max(VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH).optional(),
	name: z.string().min(1).max(VALIDATION_LIMITS.NAME_MAX_LENGTH),
	anonymousId: z.string().nullable().optional(),
	sessionId: z.string().nullable().optional(),
	timestamp: z.number().int().nullable().optional(),
	properties: z.json().optional().nullable(),
});

// Lean custom event span schema (v2.x)
export const customEventSpanSchema = z.object({
	timestamp: z.number().int(),
	path: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
	eventName: z.string().min(1).max(VALIDATION_LIMITS.NAME_MAX_LENGTH),
	anonymousId: z.string().max(VALIDATION_LIMITS.ANONYMOUS_ID_MAX_LENGTH).nullable().optional(),
	sessionId: z.string().max(VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH).nullable().optional(),
	properties: z.json().optional().nullable(),
});

export const batchedCustomEventSpansSchema = z.array(customEventSpanSchema).max(VALIDATION_LIMITS.BATCH_MAX_SIZE);

export type CustomEventSpanInput = z.infer<typeof customEventSpanSchema>;

export const outgoingLinkSchema = z.object({
	eventId: z.string().max(VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH),
	anonymousId: z.string().nullable().optional(),
	sessionId: z.string().nullable().optional(),
	timestamp: z.number().int().nullable().optional(),
	href: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
	text: z.string().max(VALIDATION_LIMITS.TEXT_MAX_LENGTH).nullable().optional(),
	properties: z.json().optional().nullable(),
});
