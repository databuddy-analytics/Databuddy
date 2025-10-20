import { z } from 'zod';
import { commonEnvSchema, createEnv, shouldSkipValidation } from './base';

/**
 * Database app-specific environment schema
 */
const databaseEnvSchema = z.object({
	...commonEnvSchema,
	NEXT_PUBLIC_API_URL: z.string().optional(),
});

/**
 * Database app environment variables
 * Tree-shakeable export for database app
 */
export const env = createEnv(databaseEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type DatabaseEnv = typeof env;
