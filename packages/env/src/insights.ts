import { z } from "zod";
import { createEnv } from "./base";
import { readBooleanEnv } from "./boolean";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const insightsEnvSchema = z.object({
	NODE_ENV: z.string().default("development"),
	INSIGHTS_AXIOM_DATASET: z.string().default("insights"),
	INSIGHTS_EVLOG_FS: optionalString,
	AXIOM_API_KEY: optionalString,
	AXIOM_TOKEN: optionalString,
	AXIOM_ORG_ID: optionalString,
	DATABUDDY_ENCRYPTION_KEY: optionalString,
	PORT: z.string().default("3005"),
	APP_ENV: optionalString,
	INSIGHTS_WORKER_ENABLED: optionalString,
	INSIGHTS_WORKER_CONCURRENCY: optionalString,
	INSIGHTS_DISPATCH_INTERVAL_MS: optionalString,
	INSIGHTS_MAINTENANCE_INTERVAL_MS: optionalString,
	INSIGHTS_STALE_ITEM_MS: optionalString,
	RAILWAY_ENVIRONMENT_NAME: optionalString,
	RAILWAY_REPLICA_REGION: optionalString,
	RAILWAY_REPLICA_ID: optionalString,
	RAILWAY_DEPLOYMENT_ID: optionalString,
	RAILWAY_GIT_COMMIT_SHA: optionalString,
});

export const env = createEnv(insightsEnvSchema, {
	skipValidation: readBooleanEnv("SKIP_VALIDATION"),
});

export type InsightsEnv = typeof env;
