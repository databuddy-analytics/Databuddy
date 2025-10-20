import { z } from 'zod';
import {
	authEnvSchema,
	commonEnvSchema,
	createEnv,
	shouldSkipValidation,
} from './base';

/**
 * API-specific environment schema
 */
const apiEnvSchema = z.object({
	...commonEnvSchema,
	...authEnvSchema,
	AI_API_KEY: z.string(),
	PORT: z.string().default('3001'),
});

/**
 * API environment variables
 * Tree-shakeable export for API app
 */
export const env = createEnv(apiEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type ApiEnv = typeof env;
