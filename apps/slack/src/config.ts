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
	const socketMode = readSocketMode();
	const appToken = process.env.SLACK_APP_TOKEN?.trim() || undefined;
	const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim() || undefined;
	if (!(socketMode ? appToken : signingSecret)) {
		const reason = socketMode
			? "SLACK_APP_TOKEN is not set"
			: "SLACK_SIGNING_SECRET is not set";
		if (process.env.NODE_ENV === "production") {
			throw new Error(reason);
		}
		return {
			enabled: false,
			reason,
		};
	}

	const encryptionKey = process.env.DATABUDDY_ENCRYPTION_KEY?.trim();
	if (!encryptionKey) {
		throw new Error(
			"DATABUDDY_ENCRYPTION_KEY is required for Slack integration secrets"
		);
	}

	return {
		appToken,
		crypto: { encryptionKey },
		enabled: true,
		logLevel: toBoltLogLevel(process.env.SLACK_LOG_LEVEL ?? "INFO"),
		port: readPort(),
		signingSecret,
		socketMode,
	};
}

function readSocketMode(): boolean {
	const value = process.env.SLACK_SOCKET_MODE?.trim().toLowerCase();
	return value ? ["1", "true", "yes", "on"].includes(value) : true;
}

function readPort(): number {
	const value = Number(process.env.SLACK_PORT || 3010);
	return Number.isInteger(value) && value > 0 ? value : 3010;
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
