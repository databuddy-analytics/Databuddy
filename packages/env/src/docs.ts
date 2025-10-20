import { z } from 'zod';
import { commonEnvSchema, createEnv, shouldSkipValidation } from './base';

/**
 * Docs-specific environment schema
 */
const docsEnvSchema = z.object({
	NODE_ENV: commonEnvSchema.NODE_ENV,
	NEXT_PUBLIC_API_URL: z.string().optional(),
	GITHUB_TOKEN: z.string().optional(),
});

/**
 * Docs environment variables
 * Tree-shakeable export for docs app
 */
export const env = createEnv(docsEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type DocsEnv = typeof env;
