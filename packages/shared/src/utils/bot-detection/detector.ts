/**
 * Bot Detector Service
 *
 * Centralized bot detection with configurable behavior and caching
 */

import { isAIAssistant, isAICrawler, isBot } from "ua-parser-js/bot-detection";
import {
	BotAction,
	BotCategory,
	type BotDetectionConfig,
	type BotDetectionResult,
	DEFAULT_BOT_CONFIG,
} from "./types";

import {
	extractBotName,
	isMonitoringBot,
	isScraperBot,
	isSEOTool,
	isSearchEngineBot,
	isSocialMediaBot,
} from "./user-agent";

/**
 * Bot Detector Service
 *
 * Provides bot detection with configuration and caching support
 */
export class BotDetectorService {
	private readonly config: Required<BotDetectionConfig>;
	private readonly cache: Map<string, BotDetectionResult>;
	private readonly cacheMaxSize = 1000;

	constructor(config?: BotDetectionConfig) {
		this.config = {
			...DEFAULT_BOT_CONFIG,
			...config,
		};
		this.cache = new Map();
	}

	/**
	 * Detect if user agent is a bot and determine action
	 */
	detect(userAgent: string): BotDetectionResult {
		// Check cache first
		const cached = this.cache.get(userAgent);
		if (cached) {
			return cached;
		}

		// Perform detection
		const result = this.performDetection(userAgent);

		// Cache result (with size limit)
		if (this.cache.size >= this.cacheMaxSize) {
			// Remove oldest entry
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(userAgent, result);

		return result;
	}

	/**
	 * Clear detection cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get current cache size
	 */
	getCacheSize(): number {
		return this.cache.size;
	}

	/**
	 * Perform bot detection logic
	 */
	private performDetection(userAgent: string): BotDetectionResult {
		// 1. Check for missing user agent
		if (!userAgent) {
			return {
				isBot: true,
				category: BotCategory.UNKNOWN_BOT,
				action: this.config.blockMissingUserAgent
					? BotAction.BLOCK
					: BotAction.ALLOW,
				confidence: 100,
				reason: "missing_user_agent",
			};
		}

		const botName = extractBotName(userAgent);
		const lowerName = botName?.toLowerCase();

		// 2. Check explicit allowlist (highest priority)
		if (lowerName && this.isInList(lowerName, this.config.allowedBots)) {
			return {
				isBot: true,
				category: this.categorizeBotByName(userAgent),
				name: botName,
				action: BotAction.ALLOW,
				confidence: 100,
				reason: "explicit_allowlist",
			};
		}

		// 3. Check explicit blocklist (second priority)
		if (lowerName && this.isInList(lowerName, this.config.blockedBots)) {
			return {
				isBot: true,
				category: this.categorizeBotByName(userAgent),
				name: botName,
				action: BotAction.BLOCK,
				confidence: 100,
				reason: "explicit_blocklist",
			};
		}

		// 4. Check AI crawlers (most specific)
		if (isAICrawler(userAgent)) {
			return {
				isBot: true,
				category: BotCategory.AI_CRAWLER,
				name: botName,
				action: this.getActionForCategory(BotCategory.AI_CRAWLER),
				confidence: 95,
				reason: "ai_crawler_pattern",
			};
		}

		// 5. Check AI assistants
		if (isAIAssistant(userAgent)) {
			return {
				isBot: true,
				category: BotCategory.AI_ASSISTANT,
				name: botName,
				action: this.getActionForCategory(BotCategory.AI_ASSISTANT),
				confidence: 95,
				reason: "ai_assistant_pattern",
			};
		}

		// 6. Check search engines
		if (isSearchEngineBot(userAgent)) {
			return {
				isBot: true,
				category: BotCategory.SEARCH_ENGINE,
				name: botName,
				action: this.config.allowSearchEngines
					? BotAction.ALLOW
					: BotAction.BLOCK,
				confidence: 90,
				reason: "search_engine_pattern",
			};
		}

		// 7. Check social media bots
		if (isSocialMediaBot(userAgent)) {
			return {
				isBot: true,
				category: BotCategory.SOCIAL_MEDIA,
				name: botName,
				action: this.config.allowSocialMedia
					? BotAction.ALLOW
					: BotAction.BLOCK,
				confidence: 90,
				reason: "social_media_pattern",
			};
		}

		// 8. Check SEO tools
		if (isSEOTool(userAgent)) {
			return {
				isBot: true,
				category: BotCategory.SEO_TOOL,
				name: botName,
				action: this.config.allowSEOTools ? BotAction.ALLOW : BotAction.BLOCK,
				confidence: 85,
				reason: "seo_tool_pattern",
			};
		}

		// 9. Check monitoring services
		if (isMonitoringBot(userAgent)) {
			return {
				isBot: true,
				category: BotCategory.MONITORING,
				name: botName,
				action: this.config.allowMonitoring ? BotAction.ALLOW : BotAction.BLOCK,
				confidence: 85,
				reason: "monitoring_pattern",
			};
		}

		// 10. Check scrapers
		if (isScraperBot(userAgent)) {
			return {
				isBot: true,
				category: BotCategory.SCRAPER,
				name: botName,
				action: BotAction.BLOCK,
				confidence: 80,
				reason: "scraper_pattern",
			};
		}

		// 11. General bot detection (fallback)
		if (isBot(userAgent)) {
			return {
				isBot: true,
				category: BotCategory.UNKNOWN_BOT,
				name: botName,
				action: BotAction.BLOCK,
				confidence: 70,
				reason: "general_bot_pattern",
			};
		}

		// 12. Not a bot
		return {
			isBot: false,
			action: BotAction.ALLOW,
			confidence: 100,
			reason: "human",
		};
	}

	/**
	 * Determine action for a specific category
	 */
	private getActionForCategory(category: BotCategory): BotAction {
		// Check if category should be tracked only
		if (this.config.trackOnlyCategories.includes(category)) {
			return BotAction.TRACK_ONLY;
		}

		// Default category actions
		switch (category) {
			case BotCategory.AI_CRAWLER:
				return this.config.allowAICrawlers
					? BotAction.ALLOW
					: BotAction.TRACK_ONLY;
			case BotCategory.AI_ASSISTANT:
				return BotAction.TRACK_ONLY;
			case BotCategory.SEARCH_ENGINE:
				return this.config.allowSearchEngines
					? BotAction.ALLOW
					: BotAction.BLOCK;
			case BotCategory.SOCIAL_MEDIA:
				return this.config.allowSocialMedia ? BotAction.ALLOW : BotAction.BLOCK;
			case BotCategory.SEO_TOOL:
				return this.config.allowSEOTools ? BotAction.ALLOW : BotAction.BLOCK;
			case BotCategory.MONITORING:
				return this.config.allowMonitoring ? BotAction.ALLOW : BotAction.BLOCK;
			default:
				return BotAction.BLOCK;
		}
	}

	/**
	 * Categorize bot by analyzing user agent
	 */
	private categorizeBotByName(userAgent: string): BotCategory {
		if (isAICrawler(userAgent)) {
			return BotCategory.AI_CRAWLER;
		}
		if (isAIAssistant(userAgent)) {
			return BotCategory.AI_ASSISTANT;
		}
		if (isSearchEngineBot(userAgent)) {
			return BotCategory.SEARCH_ENGINE;
		}
		if (isSocialMediaBot(userAgent)) {
			return BotCategory.SOCIAL_MEDIA;
		}
		if (isSEOTool(userAgent)) {
			return BotCategory.SEO_TOOL;
		}
		if (isMonitoringBot(userAgent)) {
			return BotCategory.MONITORING;
		}
		if (isScraperBot(userAgent)) {
			return BotCategory.SCRAPER;
		}
		return BotCategory.UNKNOWN_BOT;
	}

	/**
	 * Check if bot name is in a list (case-insensitive)
	 */
	private isInList(botName: string, list: string[]): boolean {
		const lower = botName.toLowerCase();
		return list.some((item) => item.toLowerCase() === lower);
	}
}

/**
 * Singleton instance for default configuration
 */
let defaultDetector: BotDetectorService | null = null;

/**
 * Get or create the default bot detector instance
 */
export function getBotDetector(
	config?: BotDetectionConfig
): BotDetectorService {
	if (!defaultDetector || config) {
		defaultDetector = new BotDetectorService(config);
	}
	return defaultDetector;
}

/**
 * Convenience function for bot detection with default config
 */
export function detectBot(
	userAgent: string,
	config?: BotDetectionConfig
): BotDetectionResult {
	return getBotDetector(config).detect(userAgent);
}
