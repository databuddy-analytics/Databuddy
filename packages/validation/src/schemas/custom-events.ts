import z from "zod";
import { VALIDATION_LIMITS } from "../constants";

const anonymizeVisitorIds = z
	.union([z.boolean(), z.literal("auto")])
	.nullable()
	.optional()
	.transform((value) => value ?? undefined);

const boundedPropertiesJson = z
	.json()
	.refine((val) => {
		if (typeof val !== "object" || val === null || Array.isArray(val)) {
			return true;
		}
		return Object.keys(val).length <= VALIDATION_LIMITS.PROPERTIES_MAX_KEYS;
	}, `Too many properties (max ${VALIDATION_LIMITS.PROPERTIES_MAX_KEYS})`)
	.refine(
		(val) =>
			JSON.stringify(val).length <= VALIDATION_LIMITS.PROPERTIES_MAX_SERIALIZED,
		`Properties too large (max ${VALIDATION_LIMITS.PROPERTIES_MAX_SERIALIZED} bytes)`
	);

// Legacy schema
export const customEventSchema = z.object({
	eventId: z.string().max(VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH).optional(),
	name: z.string().min(1).max(VALIDATION_LIMITS.NAME_MAX_LENGTH),
	anonymousId: z.string().nullable().optional(),
	anonymizeVisitorIds,
	sessionId: z.string().nullable().optional(),
	timestamp: z.number().int().nullable().optional(),
	properties: boundedPropertiesJson.optional().nullable(),
});

// Lean custom event span schema (v2.x)
export const customEventSpanSchema = z.object({
	timestamp: z.number().int(),
	path: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
	eventName: z.string().min(1).max(VALIDATION_LIMITS.NAME_MAX_LENGTH),
	anonymousId: z
		.string()
		.max(VALIDATION_LIMITS.ANONYMOUS_ID_MAX_LENGTH)
		.nullable()
		.optional(),
	anonymizeVisitorIds,
	sessionId: z
		.string()
		.max(VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH)
		.nullable()
		.optional(),
	properties: boundedPropertiesJson.optional().nullable(),
});

export const batchedCustomEventSpansSchema = z
	.array(customEventSpanSchema)
	.max(VALIDATION_LIMITS.BATCH_MAX_SIZE);

export type CustomEventSpanInput = z.infer<typeof customEventSpanSchema>;

export const outgoingLinkSchema = z.object({
	eventId: z.string().max(VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH),
	anonymousId: z.string().nullable().optional(),
	anonymizeVisitorIds,
	sessionId: z.string().nullable().optional(),
	timestamp: z.number().int().nullable().optional(),
	href: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
	text: z.string().max(VALIDATION_LIMITS.TEXT_MAX_LENGTH).nullable().optional(),
	properties: boundedPropertiesJson.optional().nullable(),
});

export type OutgoingLinkInput = z.infer<typeof outgoingLinkSchema>;
