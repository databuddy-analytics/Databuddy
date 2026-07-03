import { z } from "zod";
import { commonEnvSchema, createEnv, shouldSkipValidation } from "./base";

/**
 * Basket-specific environment schema
 */
export const basketEnvSchema = z
	.object({
		...commonEnvSchema,
		PORT: z.string().default("3002"),
		DATABUDDY_ENCRYPTION_KEY: z.string().optional(),
		STRIPE_SECRET_KEY: z.string().optional(),
		STRIPE_WEBHOOK_SECRET: z.string().optional(),
	})
	.superRefine((env, ctx) => {
		if (env.NODE_ENV === "production" && !env.DATABUDDY_ENCRYPTION_KEY) {
			ctx.addIssue({
				code: "custom",
				path: ["DATABUDDY_ENCRYPTION_KEY"],
				message:
					"DATABUDDY_ENCRYPTION_KEY is required in production — profile display names and emails cannot be encrypted without it. Generate one with generateKey() from @databuddy/encryption.",
			});
		}
	});

/**
 * Basket environment variables
 * Tree-shakeable export for basket app
 */
export const env = createEnv(basketEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type BasketEnv = typeof env;
