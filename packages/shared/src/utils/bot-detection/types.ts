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
