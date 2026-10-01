import { isAIBot, isBot } from "ua-parser-js/helpers";
import { agentBotCategory, matchAiAgent } from "./ai-agents";
import { BotAction, BotCategory, type BotDetectionResult } from "./types";
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

const ACTION_BY_CATEGORY: Record<BotCategory, BotAction> = {
	[BotCategory.AI_CRAWLER]: BotAction.TRACK_ONLY,
	[BotCategory.AI_ASSISTANT]: BotAction.TRACK_ONLY,
	[BotCategory.SEARCH_ENGINE]: BotAction.ALLOW,
	[BotCategory.SOCIAL_MEDIA]: BotAction.ALLOW,
	[BotCategory.SEO_TOOL]: BotAction.BLOCK,
	[BotCategory.MONITORING]: BotAction.ALLOW,
	[BotCategory.SCRAPER]: BotAction.BLOCK,
	[BotCategory.UNKNOWN_BOT]: BotAction.BLOCK,
};

const cache = new Map<string, BotDetectionResult>();
const CACHE_MAX = 1000;

export function detectBot(userAgent: string): BotDetectionResult {
	const cached = cache.get(userAgent);
	if (cached) {
		return cached;
	}
	const result = detect(userAgent);
	if (cache.size >= CACHE_MAX) {
		const first = cache.keys().next().value;
		if (first !== undefined) {
			cache.delete(first);
		}
	}
	cache.set(userAgent, result);
	return result;
}

function detect(userAgent: string): BotDetectionResult {
	if (!userAgent) {
		return {
			action: BotAction.BLOCK,
			category: BotCategory.UNKNOWN_BOT,
			isBot: true,
			reason: "missing_user_agent",
		};
	}

	const agent = matchAiAgent(userAgent);
	if (agent) {
		const category = agentBotCategory(agent);
		return {
			action: ACTION_BY_CATEGORY[category],
			agent,
			category,
			isBot: true,
			name: agent.name,
			reason: "ai_agent_registry",
		};
	}

	const name = extractBotName(userAgent);
	const patternCategory = matchCategory(userAgent);
	if (patternCategory || isAIBot(userAgent)) {
		const category = patternCategory
			? (CATEGORY_MAP[patternCategory] ?? BotCategory.UNKNOWN_BOT)
			: BotCategory.AI_CRAWLER;
		return {
			action: ACTION_BY_CATEGORY[category],
			category,
			isBot: true,
			name,
			reason: `${category}_pattern`,
		};
	}

	if (isBot(userAgent)) {
		return {
			action: BotAction.BLOCK,
			category: BotCategory.UNKNOWN_BOT,
			isBot: true,
			name,
			reason: "general_bot_pattern",
		};
	}

	return { action: BotAction.ALLOW, isBot: false, reason: "human" };
}
