import { z } from 'zod';
import { commonEnvSchema, createEnv, shouldSkipValidation } from './base';

/**
 * AI-specific environment schema
 */
const aiEnvSchema = z.object({
	...commonEnvSchema,
	AI_API_KEY: z.string(),
});

/**
 * AI environment variables
 * Tree-shakeable export for API app
 */
export const env = createEnv(aiEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type AiEnv = typeof env;
