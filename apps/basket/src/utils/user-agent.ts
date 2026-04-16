import {
	type BotAction,
	BotCategory,
	type BotDetectionResult,
	detectBot as sharedDetectBot,
	parseUserAgent as sharedParseUserAgent,
} from "@databuddy/shared/bot-detection";
import { captureError, record } from "@lib/tracing";

export function parseUserAgent(userAgent: string) {
	return record("parseUserAgent", () => {
		if (!userAgent) {
			return {};
		}
		try {
			const parsed = sharedParseUserAgent(userAgent);
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
			return {};
		}
	});
}

const LEGACY_CATEGORIES: Record<string, string> = {
	[BotCategory.AI_CRAWLER]: "AI Crawler",
	[BotCategory.AI_ASSISTANT]: "AI Assistant",
};

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
	const result = sharedDetectBot(userAgent);
	return {
		isBot: result.isBot,
		reason: result.reason,
		category: result.category
			? (LEGACY_CATEGORIES[result.category] ??
				(result.isBot ? "Known Bot" : undefined))
			: undefined,
		botName: result.name,
		action: result.action,
		result,
	};
}
