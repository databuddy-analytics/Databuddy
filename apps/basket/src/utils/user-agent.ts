import {
	type BotAction,
	BotCategory,
	type BotDetectionResult,
	detectBot as sharedDetectBot,
	parseUserAgent as sharedParseUserAgent,
} from "@databuddy/shared/bot-detection";
import { captureError, record } from "@lib/tracing";
import { LRUCache } from "lru-cache";

interface ParsedUserAgentFields {
	browserName?: string;
	browserVersion?: string;
	deviceBrand?: string;
	deviceModel?: string;
	deviceType?: string;
	osName?: string;
	osVersion?: string;
}

const MAX_USER_AGENT_LENGTH = 512;

const parsedUserAgentCache = new LRUCache<string, ParsedUserAgentFields>({
	max: 500,
	ttl: 300_000,
});

export function parseUserAgent(
	userAgent: string
): Promise<ParsedUserAgentFields> {
	return record("parseUserAgent", () => {
		if (!userAgent) {
			return {};
		}
		const key =
			userAgent.length > MAX_USER_AGENT_LENGTH
				? userAgent.slice(0, MAX_USER_AGENT_LENGTH)
				: userAgent;
		const cached = parsedUserAgentCache.get(key);
		if (cached) {
			return cached;
		}
		try {
			const parsed = sharedParseUserAgent(key);
			const fields: ParsedUserAgentFields = {
				browserName: parsed.browserName,
				browserVersion: parsed.browserVersion,
				osName: parsed.osName,
				osVersion: parsed.osVersion,
				deviceType: parsed.deviceType,
				deviceBrand: parsed.deviceBrand,
				deviceModel: parsed.deviceModel,
			};
			parsedUserAgentCache.set(key, fields);
			return fields;
		} catch (error) {
			captureError(error, {
				userAgent: key,
				message: "Failed to parse user agent",
			});
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
