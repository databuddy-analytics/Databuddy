import { z } from "zod";
import {
	authEnvSchema,
	commonEnvSchema,
	createEnv,
	shouldSkipValidation,
} from "./base";

/**
 * API-specific environment schema
 */
const apiEnvSchema = z.object({
	...commonEnvSchema,
	...authEnvSchema,
	AI_API_KEY: z.string(),
	PORT: z.string().default("3001"),
	CLICKHOUSE_URL: z.string(),
	CLICKHOUSE_USER: z.string().default("default"),
	CLICKHOUSE_PASSWORD: z.string().optional(),
	S3_BUCKET: z.string().optional(),
	S3_ACCESS_KEY_ID: z.string().optional(),
	S3_SECRET_ACCESS_KEY: z.string().optional(),
	S3_ENDPOINT: z.string().optional(),
	AUTUMN_WEBHOOK_SECRET: z.string().optional(),
});

/**
 * API environment variables
 * Tree-shakeable export for API app
 */
export const env = createEnv(apiEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type ApiEnv = typeof env;
