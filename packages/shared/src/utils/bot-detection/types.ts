import type { AiAgent } from "./ai-agents";

export const AI_PRODUCT_BY_OPERATOR: Record<string, string> = {
	OpenAI: "ChatGPT",
	Anthropic: "Claude",
	Google: "Google Gemini",
	Perplexity: "Perplexity",
	Microsoft: "Microsoft Copilot",
	Meta: "Meta AI",
	"Moonshot AI": "Kimi",
};

export const FEATURED_AI_PRODUCTS = [
	"ChatGPT",
	"Claude",
	"Google Gemini",
	"Perplexity",
	"Microsoft Copilot",
	"Meta AI",
];

export type AgentPurpose = "training" | "search_index" | "user_fetch" | "agent";

export const CONTENT_FORMATS = ["markdown", "llms", "html"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

const ASSET_PATH =
	/^\/_next\/|\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|zip)$/i;
const LLMS_TXT_PATH = /\/llms(-full)?\.txt$/i;
const MARKDOWN_PATH = /\.mdx?$/i;

export function isAssetPath(pathname: string): boolean {
	return ASSET_PATH.test(pathname);
}

export function contentFormatForPath(pathname: string): ContentFormat {
	if (LLMS_TXT_PATH.test(pathname)) {
		return "llms";
	}
	return MARKDOWN_PATH.test(pathname) ? "markdown" : "html";
}

export const ROBOTS_ACCESS = ["allowed", "partial", "blocked"] as const;
export type RobotsAccess = (typeof ROBOTS_ACCESS)[number];

export const UNIDENTIFIED_AGENT_PREFIX = "unidentified:";
export const UNIDENTIFIED_AGENTS_PRODUCT = "Unidentified agents";

export const BotCategory = {
	AI_CRAWLER: "ai_crawler",
	AI_ASSISTANT: "ai_assistant",
	SEARCH_ENGINE: "search_engine",
	SOCIAL_MEDIA: "social_media",
	SEO_TOOL: "seo_tool",
	MONITORING: "monitoring",
	SCRAPER: "scraper",
	UNKNOWN_BOT: "unknown_bot",
} as const;

export type BotCategory = (typeof BotCategory)[keyof typeof BotCategory];
export const BotAction = {
	ALLOW: "allow",
	TRACK_ONLY: "track_only",
	BLOCK: "block",
} as const;

export type BotAction = (typeof BotAction)[keyof typeof BotAction];
export interface BotDetectionResult {
	action: BotAction;
	agent?: Pick<AiAgent, "id" | "operator" | "purpose">;
	category?: BotCategory;
	confidence: number;
	isBot: boolean;
	name?: string;
	reason?: string;
}
export interface BotDetectionConfig {
	allowAICrawlers?: boolean;
	allowedBots?: string[];
	allowMonitoring?: boolean;
	allowSEOTools?: boolean;
	allowSearchEngines?: boolean;
	allowSocialMedia?: boolean;
	blockedBots?: string[];
	blockMissingUserAgent?: boolean;
	trackOnlyCategories?: BotCategory[];
}
export const DEFAULT_BOT_CONFIG: Required<BotDetectionConfig> = {
	allowedBots: [],
	blockedBots: [],
	allowAICrawlers: false,
	allowSearchEngines: true,
	allowSocialMedia: true,
	allowSEOTools: false,
	allowMonitoring: true,
	trackOnlyCategories: [BotCategory.AI_CRAWLER, BotCategory.AI_ASSISTANT],
	blockMissingUserAgent: true,
};
export interface ParsedUserAgent {
	browserName?: string;
	browserVersion?: string;
	deviceBrand?: string;
	deviceModel?: string;
	deviceType?: string;
	osName?: string;
	osVersion?: string;
	raw: string;
}
