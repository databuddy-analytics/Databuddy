import { z } from 'zod';

/**
 * Base environment validation utility
 */
export const createEnv = <T extends z.ZodRawShape>(
	schema: z.ZodObject<T>,
	options: {
		skipValidation?: boolean;
		environment?: Record<string, string | undefined>;
	} = {}
) => {
	const { skipValidation = false, environment = process.env } = options;

	if (skipValidation) {
		return environment as z.infer<z.ZodObject<T>>;
	}

	return schema.parse(environment);
};

/**
 * Common environment variables shared across apps
 */
export const commonEnvSchema = {
	NODE_ENV: z.string().default('development'),
	DATABASE_URL: z.string(),
	REDIS_URL: z.string(),
} as const;

/**
 * Auth-related environment variables
 */
export const authEnvSchema = {
	BETTER_AUTH_SECRET: z.string(),
	BETTER_AUTH_URL: z.string(),
	GITHUB_CLIENT_ID: z.string(),
	GITHUB_CLIENT_SECRET: z.string(),
	GOOGLE_CLIENT_ID: z.string(),
	GOOGLE_CLIENT_SECRET: z.string(),
} as const;

/**
 * External service environment variables
 */
export const externalServiceEnvSchema = {
	VERCEL_CLIENT_ID: z.string(),
	VERCEL_CLIENT_SECRET: z.string(),
	RESEND_API_KEY: z.string(),
} as const;

/**
 * Development environment check
 */
export const isDevelopment = () => process.env.NODE_ENV === 'development';

/**
 * Skip validation check
 */
export const shouldSkipValidation = () =>
	isDevelopment() || process.env.SKIP_VALIDATION === 'true';
