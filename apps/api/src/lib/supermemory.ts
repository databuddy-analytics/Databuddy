import Supermemory from "supermemory";

const apiKey = process.env.SUPERMEMORY_API_KEY;

let _client: Supermemory | null = null;

function getClient(): Supermemory | null {
	if (!apiKey) {
		return null;
	}
	if (!_client) {
		_client = new Supermemory({ apiKey });
	}
	return _client;
}

export function isMemoryEnabled(): boolean {
	return Boolean(apiKey);
}

function buildContainerTag(
	userId: string | null,
	apiKeyId: string | null
): string {
	if (userId) {
		return `user:${userId}`;
	}
	if (apiKeyId) {
		return `apikey:${apiKeyId}`;
	}
	return "anonymous";
}

export interface MemoryContext {
	staticProfile: string[];
	dynamicProfile: string[];
	relevantMemories: string[];
}

/**
 * Retrieve user profile + relevant memories for a query.
 * Returns empty context if supermemory is not configured.
 */
export async function getMemoryContext(
	query: string,
	userId: string | null,
	apiKeyId: string | null,
	threshold = 0.5
): Promise<MemoryContext> {
	const client = getClient();
	if (!client) {
		return { staticProfile: [], dynamicProfile: [], relevantMemories: [] };
	}

	const containerTag = buildContainerTag(userId, apiKeyId);

	try {
		const profile = await client.profile({
			containerTag,
			q: query,
			threshold,
		});

		const searchResults = (profile.searchResults?.results ?? []) as Array<{
			memory?: string;
			chunk?: string;
		}>;

		return {
			staticProfile: profile.profile.static,
			dynamicProfile: profile.profile.dynamic,
			relevantMemories: searchResults.map((r) => r.memory ?? r.chunk ?? ""),
		};
	} catch {
		return { staticProfile: [], dynamicProfile: [], relevantMemories: [] };
	}
}

/**
 * Store a conversation in supermemory for future context.
 * Fire-and-forget — does not throw.
 */
export function storeConversation(
	conversation: Array<{ role: string; content: string }>,
	userId: string | null,
	apiKeyId: string | null,
	metadata?: Record<string, string>
): void {
	const client = getClient();
	if (!client) {
		return;
	}

	const containerTag = buildContainerTag(userId, apiKeyId);
	const content = conversation.map((m) => `${m.role}: ${m.content}`).join("\n");

	client
		.add({
			content,
			containerTags: [containerTag],
			metadata,
		})
		.catch(() => {
			// Silently ignore — don't break agent flow
		});
}

/**
 * Store an analytics summary for a website.
 * Used for periodic ingestion of analytics context.
 */
export function storeAnalyticsSummary(
	summary: string,
	websiteId: string,
	metadata?: Record<string, string>
): void {
	const client = getClient();
	if (!client) {
		return;
	}

	client
		.add({
			content: summary,
			containerTags: [`website:${websiteId}`],
			metadata: {
				source: "databuddy",
				type: "analytics_summary",
				...metadata,
			},
		})
		.catch(() => {});
}

/**
 * Search memories for a specific query.
 */
export async function searchMemories(
	query: string,
	userId: string | null,
	apiKeyId: string | null,
	options?: { limit?: number; threshold?: number }
): Promise<Array<{ memory: string; similarity: number }>> {
	const client = getClient();
	if (!client) {
		return [];
	}

	const containerTag = buildContainerTag(userId, apiKeyId);

	try {
		const results = await client.search.memories({
			q: query,
			containerTag,
			searchMode: "hybrid",
			limit: options?.limit ?? 5,
			threshold: options?.threshold ?? 0.5,
		});

		return results.results.map((r) => ({
			memory: r.memory ?? r.chunk ?? "",
			similarity: r.similarity,
		}));
	} catch {
		return [];
	}
}

/**
 * Format memory context as a string block for injection into system prompts.
 */
export function formatMemoryForPrompt(ctx: MemoryContext): string {
	const parts: string[] = [];

	if (ctx.staticProfile.length > 0) {
		parts.push(`User profile:\n${ctx.staticProfile.join("\n")}`);
	}
	if (ctx.dynamicProfile.length > 0) {
		parts.push(`Recent context:\n${ctx.dynamicProfile.join("\n")}`);
	}
	if (ctx.relevantMemories.length > 0) {
		parts.push(
			`Relevant memories:\n${ctx.relevantMemories.filter(Boolean).join("\n")}`
		);
	}

	if (parts.length === 0) {
		return "";
	}

	return `<user-memory>
${parts.join("\n\n")}
</user-memory>`;
}
