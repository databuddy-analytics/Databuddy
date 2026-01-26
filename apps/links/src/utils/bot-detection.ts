/**
 * Bot Detection for Links App
 *
 * Uses centralized bot detection from @databuddy/shared
 */

import {
	BotCategory,
	detectBot as detectBotShared,
} from "@databuddy/shared/bot-detection";

/**
 * Check if user agent is a bot (any kind)
 */
export function isBot(userAgent: string | null): boolean {
	if (!userAgent) {
		return false;
	}
	const result = detectBotShared(userAgent);
	return result.isBot;
}

/**
 * Check if user agent is a social media or search engine bot
 * These are typically allowed for link previews
 */
export function isSocialBot(userAgent: string | null): boolean {
	if (!userAgent) {
		return false;
	}
	const result = detectBotShared(userAgent);
	return (
		result.category === BotCategory.SOCIAL_MEDIA ||
		result.category === BotCategory.SEARCH_ENGINE
	);
}
