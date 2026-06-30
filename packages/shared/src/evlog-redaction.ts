import type { RedactConfig } from "evlog";

const SECRET_KEY_PATHS = [
	"password",
	"secret",
	"*_secret",
	"*Secret",
	"token",
	"*_token",
	"*Token",
	"access_token",
	"refresh_token",
	"id_token",
	"sessionToken",
	"verificationToken",
	"apiKey",
	"api_key",
	"keyHash",
	"authorization",
	"headers.authorization",
	"cookie",
	"headers.cookie",
	"set-cookie",
	"headers.set-cookie",
	"signature",
	"stripe_signature",
	"paddle_signature",
	"webhook_secret",
	"privateKey",
] as const;

const SECRET_VALUE_PATTERNS = [
	/\bsk-[A-Za-z0-9_-]{16,}\b/g,
	/\bsk_(?:live|test)_[A-Za-z0-9_-]{12,}\b/g,
	/\bdbdy_[A-Za-z0-9_-]{24,}\b/g,
] as const;

export const databuddyEvlogRedactConfig = {
	paths: [...SECRET_KEY_PATHS],
	patterns: [...SECRET_VALUE_PATTERNS],
	replacement: "[REDACTED]",
} satisfies RedactConfig;

interface EvlogRuntimeEnv {
	APP_ENV?: string;
	NODE_ENV?: string;
	RAILWAY_ENVIRONMENT_NAME?: string;
	VERCEL_ENV?: string;
}

export function shouldRedactEvlog(env: EvlogRuntimeEnv = process.env) {
	const runtime =
		env.NODE_ENV ??
		env.APP_ENV ??
		env.RAILWAY_ENVIRONMENT_NAME ??
		env.VERCEL_ENV;

	return runtime !== "development" && runtime !== "test";
}

export const databuddyEvlogRedaction = shouldRedactEvlog()
	? databuddyEvlogRedactConfig
	: false;
