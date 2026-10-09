import {
	type ParsedUserAgent,
	parseUserAgent as sharedParseUserAgent,
} from "@databuddy/shared/bot-detection";
import { record } from "@lib/tracing";
import { LRUCache } from "lru-cache";

const MAX_USER_AGENT_LENGTH = 512;

const parsedUserAgentCache = new LRUCache<string, ParsedUserAgent>({
	max: 500,
	ttl: 300_000,
});

export function parseUserAgent(userAgent: string): Promise<ParsedUserAgent> {
	return record("parseUserAgent", () => {
		const key = userAgent.slice(0, MAX_USER_AGENT_LENGTH);
		const cached = parsedUserAgentCache.get(key);
		if (cached) {
			return cached;
		}
		const parsed = sharedParseUserAgent(key);
		parsedUserAgentCache.set(key, parsed);
		return parsed;
	});
}
