import z from "zod";
import { VALIDATION_LIMITS } from "../constants";

export const customEventSchema = z.object({
	eventId: z.string().max(VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH).optional(),
	name: z.string().min(1).max(VALIDATION_LIMITS.NAME_MAX_LENGTH),
	anonymousId: z.string().nullable().optional(),
	sessionId: z.string().nullable().optional(),
	timestamp: z.number().int().nullable().optional(),
	properties: z.json().optional().nullable(),
});

export const outgoingLinkSchema = z.object({
	eventId: z.string().max(VALIDATION_LIMITS.EVENT_ID_MAX_LENGTH),
	anonymousId: z.string().nullable().optional(),
	sessionId: z.string().nullable().optional(),
	timestamp: z.number().int().nullable().optional(),
	href: z.string().max(VALIDATION_LIMITS.PATH_MAX_LENGTH),
	text: z.string().max(VALIDATION_LIMITS.TEXT_MAX_LENGTH).nullable().optional(),
	properties: z.json().optional().nullable(),
});
