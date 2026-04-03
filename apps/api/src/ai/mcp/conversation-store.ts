import { getRedisCache } from "@databuddy/redis";

const KEY_PREFIX = "mcp:conv:";
const TTL_SEC = 24 * 60 * 60; // 24 hours
const MAX_MESSAGES = 20; // 10 turns

export interface ConversationMessage {
	content: string;
	role: "user" | "assistant";
}

function scopeFor(
	userId: string | null,
	apiKey: { id: string } | null
): string {
	if (userId) {
		return `user:${userId}`;
	}
	if (apiKey) {
		return `apikey:${apiKey.id}`;
	}
	return "anon";
}

function redisKey(scope: string, conversationId: string): string {
	return `${KEY_PREFIX}${scope}:${conversationId}`;
}

export async function getConversationHistory(
	conversationId: string,
	userId: string | null,
	apiKey: { id: string } | null
): Promise<ConversationMessage[]> {
	const redis = getRedisCache();
	if (!redis) {
		return [];
	}
	const scope = scopeFor(userId, apiKey);
	const key = redisKey(scope, conversationId);
	const raw = await redis.get(key);
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter(
			(m): m is ConversationMessage =>
				typeof m === "object" &&
				m !== null &&
				(m.role === "user" || m.role === "assistant") &&
				typeof m.content === "string"
		);
	} catch {
		return [];
	}
}

export async function appendToConversation(
	conversationId: string,
	userId: string | null,
	apiKey: { id: string } | null,
	userMessage: string,
	assistantMessage: string,
	existingMessages?: ConversationMessage[]
): Promise<void> {
	const redis = getRedisCache();
	if (!redis) {
		return;
	}
	const scope = scopeFor(userId, apiKey);
	const key = redisKey(scope, conversationId);

	const prior =
		existingMessages ??
		(await getConversationHistory(conversationId, userId, apiKey));
	const updated = [
		...prior,
		{ role: "user" as const, content: userMessage },
		{ role: "assistant" as const, content: assistantMessage },
	].slice(-MAX_MESSAGES);

	await redis.setex(key, TTL_SEC, JSON.stringify(updated));
}
