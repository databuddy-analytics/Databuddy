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
		REDPANDA_BROKER: z.string().optional(),
		REDPANDA_USER: z.string().optional(),
		REDPANDA_PASSWORD: z.string().optional(),
		REDPANDA_SSL: z.string().optional(),
		IP_HASH_SALT: z.string().optional(),
		IP_HEADER_VERIFIED: z.string().optional(),
		TRUSTED_IP_HEADER: z.string().optional(),
		RESEND_API_KEY: z.string().optional(),
	})
	.superRefine((env, ctx) => {
		if (env.NODE_ENV !== "production") {
			return;
		}
		if (!env.DATABUDDY_ENCRYPTION_KEY) {
			ctx.addIssue({
				code: "custom",
				path: ["DATABUDDY_ENCRYPTION_KEY"],
				message:
					"DATABUDDY_ENCRYPTION_KEY is required in production — profile display names and emails cannot be encrypted without it. Generate one with generateKey() from @databuddy/encryption.",
			});
		}
		if (!env.IP_HASH_SALT) {
			ctx.addIssue({
				code: "custom",
				path: ["IP_HASH_SALT"],
				message:
					"IP_HASH_SALT is required in production — the fallback salt is public in the open-source repo, so anonymized IPs would be reversible.",
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
