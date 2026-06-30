import { z } from "zod";
import {
	authEnvSchema,
	commonEnvSchema,
	createEnv,
	shouldSkipValidation,
} from "./base";

/**
 * Better Admin-specific environment schema
 */
const betterAdminEnvSchema = z.object({
	...commonEnvSchema,
	...authEnvSchema,
});

/**
 * Better Admin environment variables
 * Tree-shakeable export for better-admin app
 */
export const env = createEnv(betterAdminEnvSchema, {
	skipValidation: shouldSkipValidation(),
});

export type BetterAdminEnv = typeof env;
