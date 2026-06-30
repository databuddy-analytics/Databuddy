import { env } from "@databuddy/env/slack";
import { LogLevel } from "@slack/bolt";

export interface TokenCryptoConfig {
	encryptionKey: string;
}

export type SlackRuntimeConfig =
	| {
			enabled: false;
			reason: string;
	  }
	| {
			appToken?: string;
			crypto: TokenCryptoConfig;
			enabled: true;
			logLevel: LogLevel;
			port: number;
			signingSecret?: string;
			socketMode: boolean;
	  };

export function resolveSlackConfig(): SlackRuntimeConfig {
	if (
		!(env.SLACK_SOCKET_MODE ? env.SLACK_APP_TOKEN : env.SLACK_SIGNING_SECRET)
	) {
		const reason = env.SLACK_SOCKET_MODE
			? "SLACK_APP_TOKEN is not set"
			: "SLACK_SIGNING_SECRET is not set";
		if (env.NODE_ENV === "production") {
			throw new Error(reason);
		}
		return {
			enabled: false,
			reason,
		};
	}

	if (!env.DATABUDDY_ENCRYPTION_KEY) {
		throw new Error(
			"DATABUDDY_ENCRYPTION_KEY is required for Slack integration secrets"
		);
	}

	return {
		appToken: env.SLACK_APP_TOKEN,
		crypto: {
			encryptionKey: env.DATABUDDY_ENCRYPTION_KEY,
		},
		enabled: true,
		logLevel: toBoltLogLevel(env.SLACK_LOG_LEVEL),
		port: env.SLACK_PORT,
		signingSecret: env.SLACK_SIGNING_SECRET,
		socketMode: env.SLACK_SOCKET_MODE,
	};
}

function toBoltLogLevel(level: string): LogLevel {
	switch (level) {
		case "DEBUG":
			return LogLevel.DEBUG;
		case "WARN":
			return LogLevel.WARN;
		case "ERROR":
			return LogLevel.ERROR;
		default:
			return LogLevel.INFO;
	}
}
