/**
 * Bot Detection Types & Enums
 *
 * Centralized bot categorization and detection configuration
 */

/**
 * Bot categories for classification
 */
export enum BotCategory {
	/** AI training data collection bots (GPTBot, ClaudeBot, etc.) */
	AI_CRAWLER = "ai_crawler",

	/** AI assistant user-facing bots (ChatGPT-User, Claude-User, etc.) */
	AI_ASSISTANT = "ai_assistant",

	/** Search engine bots (Googlebot, Bingbot, etc.) */
	SEARCH_ENGINE = "search_engine",

	/** Social media preview/sharing bots (Twitter, Facebook, etc.) */
	SOCIAL_MEDIA = "social_media",

	/** SEO and analytics tools (Ahrefs, Semrush, etc.) */
	SEO_TOOL = "seo_tool",

	/** Uptime and monitoring services (Pingdom, UptimeRobot, etc.) */
	MONITORING = "monitoring",

	/** Unknown or malicious scrapers */
	SCRAPER = "scraper",

	/** Unidentified bot */
	UNKNOWN_BOT = "unknown_bot",
}

/**
 * Actions to take when a bot is detected
 */
export enum BotAction {
	/** Allow the request and track as normal traffic */
	ALLOW = "allow",

	/** Log to AI traffic table but don't count as pageview */
	TRACK_ONLY = "track_only",

	/** Reject the request and log to blocked traffic */
	BLOCK = "block",
}

/**
 * Result of bot detection
 */
export interface BotDetectionResult {
	/** Whether the user agent is identified as a bot */
	isBot: boolean;

	/** Category of bot if detected */
	category?: BotCategory;

	/** Specific bot name if identified (e.g., "GPTBot", "ClaudeBot") */
	name?: string;

	/** Action to take for this bot */
	action: BotAction;

	/** Confidence level (0-100) */
	confidence: number;

	/** Reason for detection (for logging/debugging) */
	reason?: string;
}

/**
 * Configuration for bot detection behavior
 */
export interface BotDetectionConfig {
	/** Explicitly allowed bot names (case-insensitive) */
	allowedBots?: string[];

	/** Explicitly blocked bot names (case-insensitive) */
	blockedBots?: string[];

	/** Allow AI crawlers to access content */
	allowAICrawlers?: boolean;

	/** Allow search engine bots */
	allowSearchEngines?: boolean;

	/** Allow social media preview bots */
	allowSocialMedia?: boolean;

	/** Allow SEO/analytics tools */
	allowSEOTools?: boolean;

	/** Allow monitoring services */
	allowMonitoring?: boolean;

	/** Categories to track but not block (logged separately) */
	trackOnlyCategories?: BotCategory[];

	/** Block requests with missing user agent */
	blockMissingUserAgent?: boolean;
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

	/** Operating system name */
	osName?: string;

	/** Operating system version */
	osVersion?: string;

	/** Device type (mobile, tablet, desktop, etc.) */
	deviceType?: string;

	/** Device brand/vendor */
	deviceBrand?: string;

	/** Device model */
	deviceModel?: string;

	/** Raw user agent string */
	raw: string;
}
