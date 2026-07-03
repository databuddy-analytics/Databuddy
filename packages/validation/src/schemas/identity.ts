import { z } from "zod";
import { VALIDATION_LIMITS } from "../constants";

export const profileIdSchema = z
	.string()
	.min(1)
	.max(VALIDATION_LIMITS.USER_ID_MAX_LENGTH);

const traitValueSchema = z.union([
	z.string().max(VALIDATION_LIMITS.PROPERTY_VALUE_MAX_LENGTH),
	z.number(),
	z.boolean(),
	z.null(),
]);

export const traitsSchema = z
	.record(
		z.string().min(1).max(VALIDATION_LIMITS.PROPERTY_KEY_MAX_LENGTH),
		traitValueSchema
	)
	.refine(
		(traits) =>
			Object.keys(traits).length <= VALIDATION_LIMITS.PROPERTIES_MAX_KEYS,
		{
			message: `Traits limited to ${VALIDATION_LIMITS.PROPERTIES_MAX_KEYS} keys`,
		}
	)
	.refine(
		(traits) =>
			JSON.stringify(traits).length <= VALIDATION_LIMITS.TRAITS_MAX_SERIALIZED,
		{
			message: `Traits limited to ${VALIDATION_LIMITS.TRAITS_MAX_SERIALIZED} serialized characters`,
		}
	);

export const identifyPayloadSchema = z.object({
	profileId: profileIdSchema,
	anonymousId: z
		.string()
		.min(1)
		.max(VALIDATION_LIMITS.ANONYMOUS_ID_MAX_LENGTH)
		.nullable()
		.optional(),
	traits: traitsSchema.nullable().optional(),
	websiteId: z
		.string()
		.min(1)
		.max(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH)
		.optional(),
});

export type IdentifyPayloadInput = z.infer<typeof identifyPayloadSchema>;
export type TraitsInput = z.infer<typeof traitsSchema>;
