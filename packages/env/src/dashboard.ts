import { z } from 'zod';
import {
	authEnvSchema,
	commonEnvSchema,
	createEnv,
	externalServiceEnvSchema,
	shouldSkipValidation,
} from './base';

/**
 * Dashboard-specific environment schema
 */
const dashboardEnvSchema = z.object({
	...commonEnvSchema,
	...authEnvSchema,
	...externalServiceEnvSchema,
	AUTUMN_SECRET_KEY: z.string(),
	NEXT_PUBLIC_API_URL: z.string(),
});

/**
 * Dashboard environment variables
 * Tree-shakeable export for dashboard app
 */
export const env = createEnv(dashboardEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type DashboardEnv = typeof env;
