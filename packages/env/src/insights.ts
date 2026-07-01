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
});

export const env = createEnv(insightsEnvSchema, {
	skipValidation: readBooleanEnv("SKIP_VALIDATION"),
});

export type InsightsEnv = typeof env;
