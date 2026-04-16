import { isAIAssistant, isAICrawler, isBot } from "ua-parser-js/bot-detection";
import {
	BotAction,
	BotCategory,
	type BotDetectionConfig,
	type BotDetectionResult,
	DEFAULT_BOT_CONFIG,
} from "./types";
import { extractBotName, matchCategory } from "./user-agent";

const CATEGORY_MAP: Record<string, BotCategory> = {
	AI_CRAWLER: BotCategory.AI_CRAWLER,
	AI_SEARCH: BotCategory.AI_CRAWLER,
	AI_ASSISTANT: BotCategory.AI_ASSISTANT,
	SEARCH_ENGINE: BotCategory.SEARCH_ENGINE,
	SOCIAL_MEDIA: BotCategory.SOCIAL_MEDIA,
	SEO_TOOL: BotCategory.SEO_TOOL,
	MONITORING: BotCategory.MONITORING,
	SCRAPER: BotCategory.SCRAPER,
};

const cache = new Map<string, BotDetectionResult>();
const CACHE_MAX = 1000;

function getAction(
	category: BotCategory,
	config: Required<BotDetectionConfig>
): BotAction {
	if (config.trackOnlyCategories.includes(category)) {
		return BotAction.TRACK_ONLY;
	}
	switch (category) {
		case BotCategory.AI_CRAWLER:
			return config.allowAICrawlers ? BotAction.ALLOW : BotAction.TRACK_ONLY;
		case BotCategory.AI_ASSISTANT:
			return BotAction.TRACK_ONLY;
		case BotCategory.SEARCH_ENGINE:
			return config.allowSearchEngines ? BotAction.ALLOW : BotAction.BLOCK;
		case BotCategory.SOCIAL_MEDIA:
			return config.allowSocialMedia ? BotAction.ALLOW : BotAction.BLOCK;
		case BotCategory.SEO_TOOL:
			return config.allowSEOTools ? BotAction.ALLOW : BotAction.BLOCK;
		case BotCategory.MONITORING:
			return config.allowMonitoring ? BotAction.ALLOW : BotAction.BLOCK;
		default:
			return BotAction.BLOCK;
	}
}

export function detectBot(
	userAgent: string,
	config?: BotDetectionConfig
): BotDetectionResult {
	const cached = cache.get(userAgent);
	if (cached && !config) {
		return cached;
	}

	const cfg: Required<BotDetectionConfig> = {
		...DEFAULT_BOT_CONFIG,
		...config,
	};
	const result = detect(userAgent, cfg);

	if (!config) {
		if (cache.size >= CACHE_MAX) {
			const first = cache.keys().next().value;
			if (first) {
				cache.delete(first);
			}
		}
		cache.set(userAgent, result);
	}

	return result;
}

function detect(
	userAgent: string,
	config: Required<BotDetectionConfig>
): BotDetectionResult {
	if (!userAgent) {
		return {
			isBot: true,
			category: BotCategory.UNKNOWN_BOT,
			action: config.blockMissingUserAgent ? BotAction.BLOCK : BotAction.ALLOW,
			confidence: 100,
			reason: "missing_user_agent",
		};
	}

	const name = extractBotName(userAgent);
	const lowerName = name?.toLowerCase();

	if (
		lowerName &&
		config.allowedBots.some((b) => b.toLowerCase() === lowerName)
	) {
		const cat = resolveCategory(userAgent);
		return {
			isBot: true,
			category: cat,
			name,
			action: BotAction.ALLOW,
			confidence: 100,
			reason: "explicit_allowlist",
		};
	}

	if (
		lowerName &&
		config.blockedBots.some((b) => b.toLowerCase() === lowerName)
	) {
		const cat = resolveCategory(userAgent);
		return {
			isBot: true,
			category: cat,
			name,
			action: BotAction.BLOCK,
			confidence: 100,
			reason: "explicit_blocklist",
		};
	}

	const patternCat = matchCategory(userAgent);
	if (patternCat) {
		const category = CATEGORY_MAP[patternCat] ?? BotCategory.UNKNOWN_BOT;
		return {
			isBot: true,
			category,
			name,
			action: getAction(category, config),
			confidence: category === BotCategory.UNKNOWN_BOT ? 75 : 90,
			reason: `${category}_pattern`,
		};
	}

	if (isAICrawler(userAgent)) {
		return {
			isBot: true,
			category: BotCategory.AI_CRAWLER,
			name,
			action: getAction(BotCategory.AI_CRAWLER, config),
			confidence: 90,
			reason: "ai_crawler_pattern",
		};
	}

	if (isAIAssistant(userAgent)) {
		return {
			isBot: true,
			category: BotCategory.AI_ASSISTANT,
			name,
			action: getAction(BotCategory.AI_ASSISTANT, config),
			confidence: 90,
			reason: "ai_assistant_pattern",
		};
	}

	if (isBot(userAgent)) {
		return {
			isBot: true,
			category: BotCategory.UNKNOWN_BOT,
			name,
			action: BotAction.BLOCK,
			confidence: 70,
			reason: "general_bot_pattern",
		};
	}

	return {
		isBot: false,
		action: BotAction.ALLOW,
		confidence: 100,
		reason: "human",
	};
}

function resolveCategory(userAgent: string): BotCategory {
	const patternCat = matchCategory(userAgent);
	if (patternCat) {
		return CATEGORY_MAP[patternCat] ?? BotCategory.UNKNOWN_BOT;
	}
	if (isAICrawler(userAgent)) {
		return BotCategory.AI_CRAWLER;
	}
	if (isAIAssistant(userAgent)) {
		return BotCategory.AI_ASSISTANT;
	}
	return BotCategory.UNKNOWN_BOT;
}
