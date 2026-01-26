/**
 * User Agent Utilities
 *
 * Provides functions for user agent analysis including bot detection
 * and platform identification.
 */

import {
	type BotAction,
	BotCategory,
	type BotDetectionResult,
	detectBot as detectBotShared,
	parseUserAgent as parseUserAgentShared,
} from "@databuddy/shared/bot-detection";
import { captureError, record } from "@lib/tracing";

export interface UserAgentInfo {
	bot: {
		isBot: boolean;
		name?: string;
		type?: string;
	};
	browser?: string;
	os?: string;
	device?: "desktop" | "mobile" | "tablet" | "unknown";
}

/**
 * Parse user agent to extract useful information
 */
export function parseUserAgent(userAgent: string): Promise<{
	browserName?: string;
	browserVersion?: string;
	osName?: string;
	osVersion?: string;
	deviceType?: string;
	deviceBrand?: string;
	deviceModel?: string;
}> {
	return record("parseUserAgent", () => {
		if (!userAgent) {
			return {
				browserName: undefined,
				browserVersion: undefined,
				osName: undefined,
				osVersion: undefined,
				deviceType: undefined,
				deviceBrand: undefined,
				deviceModel: undefined,
			};
		}

		try {
			const parsed = parseUserAgentShared(userAgent);
			return {
				browserName: parsed.browserName,
				browserVersion: parsed.browserVersion,
				osName: parsed.osName,
				osVersion: parsed.osVersion,
				deviceType: parsed.deviceType,
				deviceBrand: parsed.deviceBrand,
				deviceModel: parsed.deviceModel,
			};
		} catch (error) {
			captureError(error, { userAgent, message: "Failed to parse user agent" });
			return {
				browserName: undefined,
				browserVersion: undefined,
				osName: undefined,
				osVersion: undefined,
				deviceType: undefined,
				deviceBrand: undefined,
				deviceModel: undefined,
			};
		}
	});
}

/**
 * Detect bot using new centralized system
 *
 * Maps to legacy format for backwards compatibility
 */
export function detectBot(
	userAgent: string,
	_request: Request
): {
	isBot: boolean;
	reason?: string;
	category?: string;
	botName?: string;
	action?: BotAction;
	result?: BotDetectionResult;
} {
	const result = detectBotShared(userAgent);

	// Map new category to legacy format
	let legacyCategory: string | undefined;
	if (result.category === BotCategory.AI_CRAWLER) {
		legacyCategory = "AI Crawler";
	} else if (result.category === BotCategory.AI_ASSISTANT) {
		legacyCategory = "AI Assistant";
	} else if (result.isBot) {
		legacyCategory = "Known Bot";
	}

	return {
		isBot: result.isBot,
		reason: result.reason,
		category: legacyCategory,
		botName: result.name,
		action: result.action,
		result, // Include full result for new code
	};
}
