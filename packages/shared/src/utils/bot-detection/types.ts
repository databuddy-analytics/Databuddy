/**
 * Bot Detection Types & Enums
 *
 * Centralized bot categorization and detection configuration
 */

/**
 * Bot categories for classification
 */
export const BotCategory = {
	/** AI training data collection bots (GPTBot, ClaudeBot, etc.) */
	AI_CRAWLER: "ai_crawler",

	/** AI assistant user-facing bots (ChatGPT-User, Claude-User, etc.) */
	AI_ASSISTANT: "ai_assistant",

	/** Search engine bots (Googlebot, Bingbot, etc.) */
	SEARCH_ENGINE: "search_engine",

	/** Social media preview/sharing bots (Twitter, Facebook, etc.) */
	SOCIAL_MEDIA: "social_media",

	/** SEO and analytics tools (Ahrefs, Semrush, etc.) */
	SEO_TOOL: "seo_tool",

	/** Uptime and monitoring services (Pingdom, UptimeRobot, etc.) */
	MONITORING: "monitoring",

	/** Unknown or malicious scrapers */
	SCRAPER: "scraper",

	/** Unidentified bot */
	UNKNOWN_BOT: "unknown_bot",
} as const;

export type BotCategory = (typeof BotCategory)[keyof typeof BotCategory];

/**
 * Actions to take when a bot is detected
 */
export const BotAction = {
	/** Allow the request and track as normal traffic */
	ALLOW: "allow",

	/** Log to AI traffic table but don't count as pageview */
	TRACK_ONLY: "track_only",

	/** Reject the request and log to blocked traffic */
	BLOCK: "block",
} as const;

export type BotAction = (typeof BotAction)[keyof typeof BotAction];

/**
 * Result of bot detection
 */
export interface BotDetectionResult {
	/** Action to take for this bot */
	action: BotAction;

	/** Category of bot if detected */
	category?: BotCategory;

	/** Confidence level (0-100) */
	confidence: number;
	/** Whether the user agent is identified as a bot */
	isBot: boolean;

	/** Specific bot name if identified (e.g., "GPTBot", "ClaudeBot") */
	name?: string;

	/** Reason for detection (for logging/debugging) */
	reason?: string;
}

/**
 * Configuration for bot detection behavior
 */
export interface BotDetectionConfig {
	/** Allow AI crawlers to access content */
	allowAICrawlers?: boolean;
	/** Explicitly allowed bot names (case-insensitive) */
	allowedBots?: string[];

	/** Allow monitoring services */
	allowMonitoring?: boolean;

	/** Allow SEO/analytics tools */
	allowSEOTools?: boolean;

	/** Allow search engine bots */
	allowSearchEngines?: boolean;

	/** Allow social media preview bots */
	allowSocialMedia?: boolean;

	/** Explicitly blocked bot names (case-insensitive) */
	blockedBots?: string[];

	/** Block requests with missing user agent */
	blockMissingUserAgent?: boolean;

	/** Categories to track but not block (logged separately) */
	trackOnlyCategories?: BotCategory[];
}

/**
 * Default bot detection configuration
 */
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

/**
 * Parsed user agent information
 */
export interface ParsedUserAgent {
	/** Browser name */
	browserName?: string;

	/** Browser version */
	browserVersion?: string;

	/** Device brand/vendor */
	deviceBrand?: string;

	/** Device model */
	deviceModel?: string;

	/** Device type (mobile, tablet, desktop, etc.) */
	deviceType?: string;

	/** Operating system name */
	osName?: string;

	/** Operating system version */
	osVersion?: string;

	/** Raw user agent string */
	raw: string;
}
