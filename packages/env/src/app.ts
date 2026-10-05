import { LOOPBACK_HOSTS, readBooleanEnv } from "./boolean";

export {
	dataUrl,
	isLocalHost,
	isLoopbackHost,
	readBooleanEnv,
} from "./boolean";

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
	};
	integrations: {
		openAiAdsPixelId?: string;
	};
	services: ReturnType<typeof readServices>;
	storage?: StorageConfig;
	urls: {
		api: string;
		authorizationServer: string;
		basket: string;
		dashboard: string;
		links: string;
		mcp: string;
		status: string;
	};
}

const REQUIRED_IN_PRODUCTION = ["BETTER_AUTH_SECRET"] as const;
const REQUIRED_IN_HOSTED_CLOUD = ["AUTUMN_SECRET_KEY"] as const;

function isHostedCloud(env: Env): boolean {
	return env.NODE_ENV === "production" && !readBooleanEnv("SELFHOST", env);
}

export function billingMode(
	env: Env = process.env
): "selfhost" | "live" | "disabled" {
	if (readBooleanEnv("SELFHOST", env)) {
		return "selfhost";
	}
	return isHostedCloud(env) || readOptional(env, "AUTUMN_SECRET_KEY")
		? "live"
		: "disabled";
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

function readServices(env: Env) {
	return {
		autumnSecretKey: readOptional(env, "AUTUMN_SECRET_KEY"),
		axiomToken:
			env.NODE_ENV === "development"
				? undefined
				: readOptional(env, "AXIOM_TOKEN"),
		databuddyApiKey: readOptional(env, "DATABUDDY_API_KEY"),
		dubApiKey: readOptional(env, "DUB_API_KEY"),
		resendApiKey: readOptional(env, "RESEND_API_KEY"),
		slackWebhookUrl: readOptional(env, "SLACK_WEBHOOK_URL"),
		superlogApiKey: readOptional(env, "SUPERLOG_API_KEY"),
		supermemoryApiKey: readOptional(env, "SUPERMEMORY_API_KEY"),
		tccApiKey: readOptional(env, "TCC_API_KEY"),
	};
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

export function createConfig(source?: Env): Config {
	const env = source ?? process.env;
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
		},
		integrations: {
			openAiAdsPixelId: readOptional(env, "NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID"),
		},
		get services() {
			return readServices(source ?? process.env);
		},
		storage: readStorage(env),
		urls: {
			api: apiUrl,
			authorizationServer: `${dashboardUrl}/api/auth`,
			basket: readUrl(env, URLS.basket),
			dashboard: dashboardUrl,
			links: readUrl(env, URLS.links),
			mcp: new URL(
				"/v1/mcp",
				readOptional(env, "MCP_URL") ?? apiUrl
			).toString(),
			status: readUrl(env, URLS.status),
		},
	};
}

export function assertConfigured(env: Env = process.env): void {
	const problems: string[] = [];
	const hasAccessKeyId = Boolean(readOptional(env, "AWS_ACCESS_KEY_ID"));
	const hasSecretAccessKey = Boolean(
		readOptional(env, "AWS_SECRET_ACCESS_KEY")
	);

	if (hasAccessKeyId !== hasSecretAccessKey) {
		problems.push(
			"Object storage is half-configured. Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or neither."
		);
	}

	const hostedCloud = isHostedCloud(env);
	const required = hostedCloud
		? [...REQUIRED_IN_PRODUCTION, ...REQUIRED_IN_HOSTED_CLOUD]
		: REQUIRED_IN_PRODUCTION;

	if (env.NODE_ENV === "production") {
		for (const key of required) {
			if (!readOptional(env, key)) {
				problems.push(`${key} is unset or empty.`);
			}
		}
	}

	if (hostedCloud) {
		const { api, dashboard } = createConfig(env).urls;
		for (const [key, url] of [
			["API_URL", api],
			["DASHBOARD_URL", dashboard],
		] as const) {
			if (LOOPBACK_HOSTS.has(new URL(url).hostname)) {
				problems.push(
					`${key} resolves to ${url}. Set it to the public origin; a local fallback leaks into OAuth metadata and redirects.`
				);
			}
		}
	}

	if (problems.length > 0) {
		throw new Error(
			`Environment is not usable:\n- ${problems.join("\n- ")}\n\nSee CONTRIBUTING.md for the expected values.`
		);
	}
}

export const config = createConfig();
