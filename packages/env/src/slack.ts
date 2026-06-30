import { z } from "zod";
import { createEnv } from "./base";
import { readBooleanEnv } from "./boolean";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const booleanFromEnv = z.preprocess((value) => {
	if (value === undefined || value === "") {
		return;
	}
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		return ["1", "true", "yes", "on"].includes(value.toLowerCase());
	}
	return value;
}, z.boolean().default(true));

const slackEnvSchema = z.object({
	NODE_ENV: z.string().default("development"),
	SLACK_APP_ID: optionalString,
	SLACK_APP_TOKEN: optionalString,
	SLACK_APP_CONFIG_TOKEN: optionalString,
	SLACK_SIGNING_SECRET: optionalString,
	SLACK_SOCKET_MODE: booleanFromEnv,
	SLACK_PORT: z.coerce.number().int().positive().default(3010),
	SLACK_EVLOG_FS: optionalString,
	SLACK_AXIOM_DATASET: z.string().default("slack"),
	SLACK_LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
	DATABUDDY_ENCRYPTION_KEY: optionalString,
	AUTUMN_SECRET_KEY: z.string().min(1),
	BETTER_AUTH_SECRET: z.string().min(1),
	AXIOM_API_KEY: optionalString,
	AXIOM_TOKEN: optionalString,
	AXIOM_ORG_ID: optionalString,
});

export const env = createEnv(slackEnvSchema, {
	skipValidation: readBooleanEnv("SKIP_VALIDATION"),
});

export type SlackEnv = typeof env;
