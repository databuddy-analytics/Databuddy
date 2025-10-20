import { z } from 'zod';
import { commonEnvSchema, createEnv, shouldSkipValidation } from './base';

/**
 * Basket-specific environment schema
 */
const basketEnvSchema = z.object({
	...commonEnvSchema,
	PORT: z.string().default('3002'),
	STRIPE_SECRET_KEY: z.string().optional(),
	STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

/**
 * Basket environment variables
 * Tree-shakeable export for basket app
 */
export const env = createEnv(basketEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type BasketEnv = typeof env;
