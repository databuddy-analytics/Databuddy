import z from "zod/v4";

export const batchAnalyticsEventSchema = z.object({
	type: z.enum(["track"]),
	payload: z.object({
		name: z.string().max(255).optional(),
		anonymousId: z.string().max(128).optional(),
		properties: z.record(z.string(), z.unknown()).optional(),
		property: z.string().max(255).optional(),
		value: z.number().finite().optional(),
	}),
});

export const batchAnalyticsEventsSchema = z
	.array(batchAnalyticsEventSchema)
	.max(100);
