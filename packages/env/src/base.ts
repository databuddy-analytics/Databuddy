import { z } from "zod";
import { readBooleanEnv } from "./boolean";

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
	NODE_ENV: z.string().default("development"),
	DATABASE_URL: z.string(),
	DB_POOL_MAX: z.string().optional(),
	REDIS_URL: z.string(),
	ALERTS_EMAIL_FROM: z.string().optional(),
	API_URL: z.string().optional(),
	BASKET_URL: z.string().optional(),
	DASHBOARD_URL: z.string().optional(),
	EMAIL_FROM: z.string().optional(),
	NEXT_PUBLIC_API_URL: z.string().optional(),
	NEXT_PUBLIC_APP_URL: z.string().optional(),
	NEXT_PUBLIC_BASKET_URL: z.string().optional(),
	NEXT_PUBLIC_STATUS_URL: z.string().optional(),
	STATUS_URL: z.string().optional(),
} as const;

/**
 * Auth-related environment variables
 */
export const authEnvSchema = {
	BETTER_AUTH_SECRET: z.string(),
	BETTER_AUTH_URL: z.string(),
} as const;

/**
 * External service environment variables
 */
export const externalServiceEnvSchema = {
	RESEND_API_KEY: z.string(),
} as const;

/**
 * Development environment check
 */
export const isDevelopment = () => process.env.NODE_ENV === "development";

/**
 * Skip validation check
 */
export const shouldSkipValidation = () =>
	isDevelopment() || readBooleanEnv("SKIP_VALIDATION");
