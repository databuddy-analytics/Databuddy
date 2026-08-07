export type ProviderCategory =
	| "hosting"
	| "database"
	| "cdn"
	| "email"
	| "payments"
	| "billing"
	| "auth"
	| "ai"
	| "observability"
	| "integration"
	| "webhooks"
	| "cms"
	| "marketing";

export type DataRegion = "eu" | "us" | "global";

export type DataCategory =
	| "analytics"
	| "account"
	| "billing"
	| "email"
	| "logs"
	| "traces"
	| "ai-context"
	| "marketing"
	| "none";

export type ProviderStatus = "active" | "planned" | "deprecating" | "removed";

export interface Provider {
	category: ProviderCategory;
	customerConnected?: boolean;
	dataCategories: DataCategory[];
	dpaUrl?: string;
	envKeys: string[];
	hostedBy?: string;
	id: string;
	name: string;
	note?: string;
	packages?: string[];
	processesPersonalData: boolean;
	purpose: string;
	region: DataRegion;
	selfHosted?: boolean;
	status: ProviderStatus;
	subprocessor: boolean;
}

export const INTERNAL_ENV_KEYS: readonly string[] = [
	"IMAGE_TAG",
	"NODE_ENV",
	"DASHBOARD_URL",
	"API_URL",
	"BASKET_URL",
	"LINKS_URL",
	"NEXT_PUBLIC_APP_URL",
	"NEXT_PUBLIC_API_URL",
	"NEXT_PUBLIC_BASKET_URL",
	"NEXT_PUBLIC_LINKS_URL",
	"NEXT_PUBLIC_STATUS_URL",
	"BETTER_AUTH_URL",
	"BETTER_AUTH_SECRET",
	"DATABUDDY_ENCRYPTION_KEY",
	"IP_HASH_SALT",
];

export const PROVIDERS: readonly Provider[] = [
	{
		id: "hetzner",
		name: "Hetzner",
		category: "hosting",
		purpose:
			"Physical servers hosting analytics and application databases in Germany.",
		region: "eu",
		dataCategories: ["analytics", "account"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: [],
		dpaUrl: "https://www.hetzner.com/legal/data-processing-agreement",
	},
	{
		id: "railway",
		name: "Railway",
		category: "hosting",
		purpose: "Infrastructure for the API and backend services.",
		region: "us",
		dataCategories: ["analytics", "account", "logs"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: [],
	},
	{
		id: "vercel",
		name: "Vercel",
		category: "hosting",
		purpose: "Hosts the dashboard frontend.",
		region: "us",
		dataCategories: ["account"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: [],
		note: "Confirm whether the dashboard is still on Vercel or has moved to Railway.",
	},
	{
		id: "bunny",
		name: "Bunny.net",
		category: "cdn",
		purpose: "Global CDN delivering the tracking script and geo databases.",
		region: "global",
		dataCategories: ["none"],
		processesPersonalData: false,
		subprocessor: true,
		status: "active",
		envKeys: [],
	},
	{
		id: "postgres",
		name: "PostgreSQL (Neon)",
		category: "database",
		purpose: "Primary relational store for users, organizations, and settings.",
		region: "us",
		dataCategories: ["account", "billing"],
		processesPersonalData: true,
		subprocessor: false,
		selfHosted: true,
		hostedBy: "hetzner",
		status: "active",
		envKeys: ["DATABASE_URL", "POSTGRES_PASSWORD"],
		packages: ["@neondatabase/serverless"],
		note: "Depends on @neondatabase/serverless. Confirm production host: Hetzner (as disclosed) or Neon (US). If Neon, add it as a subprocessor.",
	},
	{
		id: "clickhouse",
		name: "ClickHouse",
		category: "database",
		purpose: "Analytics event and time-series warehouse.",
		region: "eu",
		dataCategories: ["analytics"],
		processesPersonalData: true,
		subprocessor: false,
		selfHosted: true,
		hostedBy: "hetzner",
		status: "active",
		envKeys: ["CLICKHOUSE_URL", "CLICKHOUSE_DQL_URL", "CLICKHOUSE_PASSWORD"],
		packages: ["@clickhouse/client"],
	},
	{
		id: "redis",
		name: "Redis",
		category: "database",
		purpose: "Caching, rate limiting, and BullMQ job queues.",
		region: "eu",
		dataCategories: ["analytics", "account"],
		processesPersonalData: true,
		subprocessor: false,
		selfHosted: true,
		hostedBy: "hetzner",
		status: "active",
		envKeys: ["REDIS_URL", "BULLMQ_REDIS_URL", "REDIS_PASSWORD"],
		packages: ["ioredis", "bullmq"],
	},
	{
		id: "resend",
		name: "Resend",
		category: "email",
		purpose: "Transactional email for account, billing, and alerts.",
		region: "global",
		dataCategories: ["email", "account"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: ["RESEND_API_KEY", "EMAIL_FROM", "ALERTS_EMAIL_FROM"],
		packages: ["resend"],
	},
	{
		id: "stripe",
		name: "Stripe",
		category: "payments",
		purpose: "Payment processing for Databuddy subscriptions (via Autumn).",
		region: "global",
		dataCategories: ["billing"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: [],
		packages: ["stripe"],
		note: "Also used to ingest customer-connected revenue webhooks; that usage is customer data, not a Databuddy subprocessor.",
	},
	{
		id: "autumn",
		name: "Autumn",
		category: "billing",
		purpose: "Usage-based metering and feature quota enforcement.",
		region: "global",
		dataCategories: ["billing", "account"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: ["AUTUMN_SECRET_KEY"],
		packages: ["autumn-js"],
	},
	{
		id: "paddle",
		name: "Paddle",
		category: "payments",
		purpose:
			"Customer-connected revenue integration for analytics attribution.",
		region: "global",
		dataCategories: ["billing"],
		processesPersonalData: false,
		subprocessor: false,
		customerConnected: true,
		status: "active",
		envKeys: [],
	},
	{
		id: "ai-gateway",
		name: "AI Gateway (Anthropic Claude)",
		category: "ai",
		purpose: "LLM routing for the insights agent over customer analytics.",
		region: "us",
		dataCategories: ["ai-context", "analytics"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: ["AI_GATEWAY_API_KEY"],
		packages: ["ai", "@ai-sdk/provider"],
		note: "Not disclosed. Contradicts the EU-exclusivity clause; pin to zero-retention + no-training and region-gate where possible.",
	},
	{
		id: "firecrawl",
		name: "Firecrawl",
		category: "ai",
		purpose: "Web scraping tool used during AI investigations.",
		region: "us",
		dataCategories: ["ai-context"],
		processesPersonalData: false,
		subprocessor: true,
		status: "deprecating",
		envKeys: ["FIRECRAWL_API_KEY"],
		note: "Self-host (OSS) or drop to cut AI surface.",
	},
	{
		id: "supermemory",
		name: "Supermemory",
		category: "ai",
		purpose: "External vector store for AI investigation context.",
		region: "us",
		dataCategories: ["ai-context", "analytics"],
		processesPersonalData: true,
		subprocessor: true,
		status: "deprecating",
		envKeys: ["SUPERMEMORY_API_KEY"],
		packages: ["supermemory"],
		note: "Replace with pgvector on existing Postgres to remove an external store.",
	},
	{
		id: "axiom",
		name: "Axiom",
		category: "observability",
		purpose: "OTEL traces and metrics.",
		region: "us",
		dataCategories: ["logs", "traces"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: ["AXIOM_TOKEN"],
		note: "Standardize observability on a single drain; deprecate Superlog, ContextCompany, and Logtail.",
	},
	{
		id: "superlog",
		name: "Superlog",
		category: "observability",
		purpose: "OTLP wide-event log export.",
		region: "us",
		dataCategories: ["logs"],
		processesPersonalData: true,
		subprocessor: true,
		status: "deprecating",
		envKeys: ["SUPERLOG_API_KEY"],
		note: "Redundant log drain; consolidate onto Axiom.",
	},
	{
		id: "contextcompany",
		name: "ContextCompany",
		category: "observability",
		purpose: "Distributed tracing.",
		region: "us",
		dataCategories: ["traces"],
		processesPersonalData: true,
		subprocessor: true,
		status: "deprecating",
		envKeys: ["TCC_API_KEY"],
		packages: ["@contextcompany/otel"],
		note: "Redundant tracing; consolidate onto Axiom.",
	},
	{
		id: "logtail",
		name: "Logtail (Better Stack)",
		category: "observability",
		purpose: "Log aggregation.",
		region: "us",
		dataCategories: ["logs"],
		processesPersonalData: true,
		subprocessor: true,
		status: "deprecating",
		envKeys: [],
		packages: ["@logtail/js", "@logtail/edge", "@logtail/pino"],
		note: "Redundant log drain; consolidate onto Axiom.",
	},
	{
		id: "slack",
		name: "Slack",
		category: "integration",
		purpose: "OAuth and bot integration for the Slack agent adapter.",
		region: "us",
		dataCategories: ["account", "analytics"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: [
			"SLACK_APP_TOKEN",
			"SLACK_SIGNING_SECRET",
			"SLACK_CLIENT_ID",
			"SLACK_CLIENT_SECRET",
			"SLACK_REDIRECT_URI",
		],
		packages: ["@slack/bolt", "@slack/web-api"],
	},
	{
		id: "google-oauth",
		name: "Google",
		category: "auth",
		purpose: "Sign-in via Google identity provider.",
		region: "us",
		dataCategories: ["account"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
	},
	{
		id: "github-oauth",
		name: "GitHub",
		category: "auth",
		purpose: "Sign-in via GitHub identity provider.",
		region: "us",
		dataCategories: ["account"],
		processesPersonalData: true,
		subprocessor: true,
		status: "active",
		envKeys: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
	},
	{
		id: "openai-ads",
		name: "OpenAI Ads Pixel",
		category: "marketing",
		purpose: "Conversion tracking pixel on the marketing site.",
		region: "us",
		dataCategories: ["marketing"],
		processesPersonalData: true,
		subprocessor: true,
		status: "deprecating",
		envKeys: ["NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID"],
		note: "Third-party tracking on a privacy-first site. Drop it or disclose in the Privacy Policy.",
	},
	{
		id: "marble",
		name: "Marble CMS",
		category: "cms",
		purpose: "Blog content management for the docs site.",
		region: "global",
		dataCategories: ["none"],
		processesPersonalData: false,
		subprocessor: false,
		status: "active",
		envKeys: ["MARBLE_API_KEY", "MARBLE_WORKSPACE_KEY", "MARBLE_API_URL"],
	},
	{
		id: "notra",
		name: "Notra",
		category: "cms",
		purpose: "Changelog management for the docs site.",
		region: "global",
		dataCategories: ["none"],
		processesPersonalData: false,
		subprocessor: false,
		status: "active",
		envKeys: ["NOTRA_API_KEY"],
		packages: ["@usenotra/sdk"],
	},
	{
		id: "svix",
		name: "Svix",
		category: "webhooks",
		purpose: "Webhook signature verification for inbound provider events.",
		region: "us",
		dataCategories: ["billing"],
		processesPersonalData: false,
		subprocessor: false,
		status: "active",
		envKeys: [],
		packages: ["svix"],
	},
];

export function regionLabel(region: DataRegion): string {
	if (region === "eu") {
		return "EU";
	}
	if (region === "us") {
		return "US";
	}
	return "Global";
}

export function getProvider(id: string): Provider | undefined {
	return PROVIDERS.find((provider) => provider.id === id);
}

export function activeProviders(): Provider[] {
	return PROVIDERS.filter((provider) => provider.status !== "removed");
}

export function subprocessors(): Provider[] {
	return PROVIDERS.filter(
		(provider) =>
			provider.subprocessor &&
			!provider.customerConnected &&
			provider.status !== "removed"
	);
}

export function providerEnvKeys(): Set<string> {
	const keys = new Set<string>();
	for (const provider of PROVIDERS) {
		for (const key of provider.envKeys) {
			keys.add(key);
		}
	}
	return keys;
}
