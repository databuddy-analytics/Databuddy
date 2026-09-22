import { readBooleanEnv } from "./boolean";

export { readBooleanEnv } from "./boolean";

// App-wide runtime config.
//
// To add or change a public URL, edit one entry in URLS:
// - cloud: default in hosted production
// - local: default for development and self-hosting
// - env: fallback order, first non-empty value wins
//
// Server code should import `config` from "@databuddy/env/app".
// Browser/client code should import `publicConfig` from "@databuddy/env/public".
const URLS = {
	api: {
		cloud: "https://api.databuddy.cc",
		local: "http://localhost:3001",
		env: ["API_URL", "NEXT_PUBLIC_API_URL"],
	},
	basket: {
		cloud: "https://basket.databuddy.cc",
		local: "http://localhost:4000",
		env: ["BASKET_URL", "NEXT_PUBLIC_BASKET_URL"],
	},
	dashboard: {
		cloud: "https://app.databuddy.cc",
		local: "http://localhost:3000",
		env: ["DASHBOARD_URL", "NEXT_PUBLIC_APP_URL", "BETTER_AUTH_URL"],
	},
	links: {
		cloud: "https://dby.sh",
		local: "http://localhost:2500",
		env: ["LINKS_URL", "NEXT_PUBLIC_LINKS_URL"],
	},
	status: {
		cloud: "https://status.databuddy.cc",
		local: "http://localhost:3002",
		env: ["STATUS_URL", "NEXT_PUBLIC_STATUS_URL"],
	},
} as const;

const MCP_SERVER_PATH = "/v1/mcp/";

// Email sender defaults. Env fallback order works the same way as URLS.
const EMAIL = {
	alertsFrom: {
		default: "Databuddy <alerts@databuddy.cc>",
		env: ["ALERTS_EMAIL_FROM", "EMAIL_FROM"],
	},
	from: {
		default: "Databuddy <no-reply@databuddy.cc>",
		env: ["EMAIL_FROM"],
	},
} as const;

const TRAILING_SLASH = /\/$/;

type Env = Record<string, string | undefined>;
type UrlConfig = (typeof URLS)[keyof typeof URLS];
type EmailConfig = (typeof EMAIL)[keyof typeof EMAIL];

export interface StorageConfig {
	accessKeyId: string;
	endpoint: string;
	publicUrl: string;
	region: string;
	secretAccessKey: string;
}

export interface Config {
	cors: {
		apiOrigins: string[];
	};
	email: {
		alertsFrom: string;
		from: string;
		resendApiKey?: string;
	};
	integrations: {
		openAiAdsPixelId?: string;
	};
	storage?: StorageConfig;
	urls: {
		api: string;
		basket: string;
		dashboard: string;
		links: string;
		mcp: string;
		status: string;
	};
}

function isHostedCloud(env: Env): boolean {
	return env.NODE_ENV === "production" && !readBooleanEnv("SELFHOST", env);
}

function defaultUrl(env: Env, setting: UrlConfig): string {
	return isHostedCloud(env) ? setting.cloud : setting.local;
}

function readFirst(env: Env, keys: readonly string[]): string | undefined {
	return keys.map((key) => env[key]?.trim()).find(Boolean);
}

function normalizeUrl(value: string): string {
	return new URL(value).toString().replace(TRAILING_SLASH, "");
}

function normalizeOrigin(value: string): string {
	return new URL(value.includes("://") ? value : `https://${value}`).origin;
}

function readUrl(env: Env, setting: UrlConfig): string {
	const fallback = defaultUrl(env, setting);
	const value = readFirst(env, setting.env);
	if (!value) {
		return fallback;
	}

	return normalizeUrl(value);
}

function readEmail(env: Env, setting: EmailConfig): string {
	return readFirst(env, setting.env) ?? setting.default;
}

function readOptional(env: Env, key: string): string | undefined {
	return env[key]?.trim() || undefined;
}

function readList(value: string | undefined): string[] {
	return (
		value
			?.split(",")
			.map((item) => item.trim())
			.filter(Boolean) ?? []
	);
}

function readOrigins(values: Array<string | undefined>): string[] {
	return [...new Set(values.flatMap(readList).map(normalizeOrigin))];
}

function readStorage(env: Env): StorageConfig | undefined {
	const accessKeyId = readOptional(env, "AWS_ACCESS_KEY_ID");
	const secretAccessKey = readOptional(env, "AWS_SECRET_ACCESS_KEY");

	if (!(accessKeyId && secretAccessKey)) {
		return;
	}

	const bucket = readOptional(env, "STORAGE_BUCKET") ?? "databuddy-static";
	const endpoint = normalizeUrl(
		readOptional(env, "STORAGE_ENDPOINT") ?? `https://${bucket}.t3.storage.dev`
	);

	return {
		accessKeyId,
		endpoint,
		publicUrl: normalizeUrl(
			readOptional(env, "STORAGE_PUBLIC_URL") ?? endpoint
		),
		region: readOptional(env, "AWS_REGION") ?? "auto",
		secretAccessKey,
	};
}

export function createConfig(env: Env = process.env): Config {
	const dashboardUrl = readUrl(env, URLS.dashboard);
	const apiUrl = readUrl(env, URLS.api);

	return {
		cors: {
			apiOrigins: readOrigins([
				dashboardUrl,
				env.RAILWAY_SERVICE_DASHBOARD_URL,
				env.API_CORS_ORIGINS,
			]),
		},
		email: {
			alertsFrom: readEmail(env, EMAIL.alertsFrom),
			from: readEmail(env, EMAIL.from),
			resendApiKey: readOptional(env, "RESEND_API_KEY"),
		},
		integrations: {
			openAiAdsPixelId: readOptional(env, "NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID"),
		},
		storage: readStorage(env),
		urls: {
			api: apiUrl,
			basket: readUrl(env, URLS.basket),
			dashboard: dashboardUrl,
			links: readUrl(env, URLS.links),
			mcp: new URL(MCP_SERVER_PATH, apiUrl).toString(),
			status: readUrl(env, URLS.status),
		},
	};
}

export function assertStorageConfigured(): void {
	const hasAccessKeyId = Boolean(
		readOptional(process.env, "AWS_ACCESS_KEY_ID")
	);
	const hasSecret = Boolean(readOptional(process.env, "AWS_SECRET_ACCESS_KEY"));

	if (hasAccessKeyId !== hasSecret) {
		throw new Error(
			"Object storage is half-configured. Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or neither."
		);
	}
}

export const config = createConfig();
