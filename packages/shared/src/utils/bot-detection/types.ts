import type { AiAgent } from "./ai-agents";

export const FEATURED_AI_PRODUCTS = [
	"ChatGPT",
	"Claude",
	"Google Gemini",
	"Perplexity",
	"Microsoft Copilot",
	"Meta AI",
];

export const AI_ICON_COLORS: Record<string, string | null> = {
	Ai2: "#F0529C",
	Amazon: "#FF9900",
	Apple: null,
	Atlassian: "#0052CC",
	ByteDance: "#3C8CFF",
	ChatGPT: null,
	Claude: "#D97757",
	Cloudflare: "#F38020",
	Cohere: "#FF7759",
	Copilot: "#0D91E1",
	Cursor: null,
	DeepSeek: "#5786FE",
	Devin: "#0294DE",
	Doubao: "#1E37FC",
	DuckDuckGo: "#DE5833",
	Exa: "#1F40ED",
	Firecrawl: null,
	Gemini: "#8E75B2",
	Google: "#4285F4",
	Huawei: "#FF0000",
	Kagi: "#FFB319",
	Kimi: "#1783FF",
	Manus: null,
	Meta: "#0467DF",
	Mistral: "#FA520F",
	Mozilla: null,
	OpenCode: null,
	Parallel: null,
	Perplexity: "#1FB8CD",
	Phind: null,
	Poe: "#5D5CDE",
	Qwen: "#6F69F7",
	Tavily: "#FE363B",
	v0: null,
	Zed: "#084CCF",
};

const PRODUCT_WORD_SEPARATOR = /[^a-z0-9]+/;

export function aiProductIcon(product: string): string | undefined {
	const name = product.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
	if (!name) {
		return;
	}
	const icons = Object.keys(AI_ICON_COLORS);
	const words = product.includes(".")
		? []
		: product.toLowerCase().split(PRODUCT_WORD_SEPARATOR);
	return (
		icons.find((icon) => icon.toLowerCase() === name) ??
		icons.find((icon) => words.includes(icon.toLowerCase()))
	);
}

export type AgentPurpose = "training" | "search_index" | "user_fetch" | "agent";

export const CONTENT_FORMATS = ["markdown", "llms", "html"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

const ASSET_PATH =
	/^\/_next\/|\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|zip)$/i;
export const NON_PAGE_PATH =
	/\/robots\.txt$|\/sitemap[^/]*\.txt$|\.(?:xml|json|webmanifest)$|\/\./i;
const LLMS_TXT_PATH = /\/llms(-full)?\.txt$/i;
const MARKDOWN_PATH = /\.mdx?$/i;

const MARKDOWN_MEDIA_TYPE = /^\s*text\/(?:x-)?markdown\b/i;
const ZERO_QUALITY = /;\s*q\s*=\s*0(?:\.0{0,3})?\s*$/i;

export function isAssetPath(pathname: string): boolean {
	return ASSET_PATH.test(pathname);
}

function acceptsMarkdown(mediaType: string): boolean {
	return MARKDOWN_MEDIA_TYPE.test(mediaType) && !ZERO_QUALITY.test(mediaType);
}

export function isMarkdownFirstAccept(accept: string): boolean {
	return acceptsMarkdown(accept.split(",")[0] ?? "");
}

export function contentFormat(pathname: string, accept = ""): ContentFormat {
	if (LLMS_TXT_PATH.test(pathname)) {
		return "llms";
	}
	return MARKDOWN_PATH.test(pathname) || accept.split(",").some(acceptsMarkdown)
		? "markdown"
		: "html";
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
	agent?: AiAgent;
	category?: BotCategory;
	isBot: boolean;
	name?: string;
	reason: string;
}
export interface ParsedUserAgent {
	browserName?: string;
	browserVersion?: string;
	deviceBrand?: string;
	deviceModel?: string;
	deviceType?: string;
	osName?: string;
	osVersion?: string;
}
