import { MAX_FUTURE_MS, MIN_TIMESTAMP } from "@databuddy/validation";
import { VALIDATION_LIMITS } from "@utils/validation";
import { z } from "zod";

const boundedProperties = z
	.record(z.string().max(128), z.unknown())
	.refine(
		(obj) => Object.keys(obj).length <= 50,
		"Too many properties (max 50)"
	)
	.refine(
		(obj) => JSON.stringify(obj).length <= 32_768,
		"Properties too large (max 32KB)"
	);

function timestampInWindow(timestamp: number): boolean {
	return (
		Number.isFinite(timestamp) &&
		timestamp >= MIN_TIMESTAMP &&
		timestamp <= Date.now() + MAX_FUTURE_MS
	);
}

const timestampSchema = z.union([
	z
		.number()
		.int()
		.finite()
		.refine(timestampInWindow, "Timestamp outside accepted range"),
	z.string().refine((value) => {
		const timestamp = new Date(value).getTime();
		return timestampInWindow(timestamp);
	}, "Invalid timestamp"),
	z.date().refine((value) => {
		const timestamp = value.getTime();
		return timestampInWindow(timestamp);
	}, "Invalid timestamp"),
]);

const anonymizeVisitorIds = z
	.union([z.boolean(), z.literal("auto")])
	.optional();

const trackEventObject = z.object({
	name: z.string().min(1).max(256),
	namespace: z.string().max(64).optional(),
	timestamp: timestampSchema.optional(),
	properties: boundedProperties.optional(),
	anonymousId: z.string().max(256).optional(),
	anonymizeVisitorIds,
	sessionId: z.string().max(256).optional(),
	websiteId: z
		.string()
		.max(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH)
		.optional(),
	source: z.string().max(64).optional(),
});

export const trackEventSchema = z.union([
	trackEventObject,
	z.array(trackEventObject).max(VALIDATION_LIMITS.BATCH_MAX_SIZE),
]);
