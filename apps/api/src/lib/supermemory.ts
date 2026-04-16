import Supermemory from "supermemory";

const apiKey = process.env.SUPERMEMORY_API_KEY;
const MEMORY_SANITIZE_RE = /<\/?[a-z_][a-z_0-9-]*(?:\s[^>]*)?\s*\/?>/gi;
const MAX_MEMORY_LENGTH = 2000;

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

export function sanitizeMemoryContent(
	value: string,
	maxLength = MAX_MEMORY_LENGTH
): string {
	let cleaned = value.slice(0, maxLength);
	cleaned = cleaned.replace(MEMORY_SANITIZE_RE, "");
	return cleaned;
}

function buildContainerTags(
	userId: string | null,
	apiKeyId: string | null,
	websiteId?: string | null
): string[] {
	const tags: string[] = [];
	if (userId) {
		tags.push(`user:${userId}`);
	} else if (apiKeyId) {
		tags.push(`apikey:${apiKeyId}`);
	}
	if (websiteId) {
		tags.push(`website:${websiteId}`);
	}
	if (tags.length === 0) {
		tags.push("anonymous");
	}
	return tags;
}

function primaryContainerTag(
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
	dynamicProfile: string[];
	relevantMemories: string[];
	staticProfile: string[];
}

export async function getMemoryContext(
	query: string,
	userId: string | null,
	apiKeyId: string | null,
	options?: { websiteId?: string; threshold?: number }
): Promise<MemoryContext> {
	const client = getClient();
	if (!client) {
		return { staticProfile: [], dynamicProfile: [], relevantMemories: [] };
	}

	const containerTag = primaryContainerTag(userId, apiKeyId);
	const threshold = options?.threshold ?? 0.25;

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

export function storeConversation(
	conversation: Array<{ role: string; content: string }>,
	userId: string | null,
	apiKeyId: string | null,
	options?: {
		metadata?: Record<string, string>;
		websiteId?: string;
		conversationId?: string;
		domain?: string;
	}
): void {
	const client = getClient();
	if (!client) {
		return;
	}

	const containerTags = buildContainerTags(
		userId,
		apiKeyId,
		options?.websiteId
	);
	const content = conversation.map((m) => `${m.role}: ${m.content}`).join("\n");

	const domain = options?.domain ?? "unknown";
	const entityContext = `Analytics conversation about ${domain}. Extract user preferences, KPIs they track, alerts they care about, and recurring questions.`;

	client
		.add({
			content,
			containerTags,
			metadata: {
				...(options?.websiteId && { websiteId: options.websiteId }),
				...(options?.conversationId && {
					conversationId: options.conversationId,
				}),
				...options?.metadata,
			},
			entityContext,
		})
		.catch(() => {});
}

export function storeAnalyticsSummary(
	summary: string,
	websiteId: string,
	metadata?: Record<string, string>
): Promise<void> {
	const client = getClient();
	if (!client) {
		return Promise.resolve();
	}

	return client
		.add({
			content: summary,
			containerTags: [`website:${websiteId}`],
			metadata: {
				source: "databuddy",
				type: "analytics_summary",
				websiteId,
				...metadata,
			},
			entityContext:
				"Weekly analytics summary for a website. Extract trends, anomalies, and key metrics.",
		})
		.then(() => undefined);
}

export function saveCuratedMemory(
	content: string,
	userId: string | null,
	apiKeyId: string | null,
	options?: {
		category?: string;
		websiteId?: string;
	}
): void {
	const client = getClient();
	if (!client) {
		return;
	}

	const containerTags = buildContainerTags(
		userId,
		apiKeyId,
		options?.websiteId
	);

	client
		.add({
			content: sanitizeMemoryContent(content),
			containerTags,
			metadata: {
				category: options?.category ?? "insight",
				type: "curated",
				...(options?.websiteId && { websiteId: options.websiteId }),
			},
			entityContext:
				"Curated user insight or preference. Store as a durable fact about this user.",
		})
		.catch(() => {});
}

export async function searchMemories(
	query: string,
	userId: string | null,
	apiKeyId: string | null,
	options?: {
		limit?: number;
		threshold?: number;
		websiteId?: string;
	}
): Promise<Array<{ memory: string; similarity: number }>> {
	const client = getClient();
	if (!client) {
		return [];
	}

	const containerTag = primaryContainerTag(userId, apiKeyId);

	const filters = options?.websiteId
		? {
				OR: [
					{
						key: "websiteId",
						value: options.websiteId,
						filterType: "metadata" as const,
					},
					{
						key: "type",
						value: "curated",
						filterType: "metadata" as const,
					},
				],
			}
		: undefined;

	try {
		const results = await client.search.memories({
			q: query,
			containerTag,
			searchMode: "hybrid",
			limit: options?.limit ?? 5,
			threshold: options?.threshold ?? 0.4,
			...(filters && { filters }),
		});

		return results.results.map((r) => ({
			memory: r.memory ?? r.chunk ?? "",
			similarity: r.similarity,
		}));
	} catch {
		return [];
	}
}

export async function forgetMemory(
	containerTag: string,
	memoryContent: string
): Promise<{ success: boolean }> {
	const client = getClient();
	if (!client) {
		return { success: false };
	}

	try {
		await client.memories.forget({ containerTag, content: memoryContent });
		return { success: true };
	} catch {
		return { success: false };
	}
}

function sanitizeMemoryString(value: string): string {
	return sanitizeMemoryContent(value, Number.POSITIVE_INFINITY);
}

export function formatMemoryForPrompt(ctx: MemoryContext): string {
	const parts: string[] = [];

	if (ctx.staticProfile.length > 0) {
		parts.push(
			`User profile:\n${ctx.staticProfile.map(sanitizeMemoryString).join("\n")}`
		);
	}
	if (ctx.dynamicProfile.length > 0) {
		parts.push(
			`Recent context:\n${ctx.dynamicProfile.map(sanitizeMemoryString).join("\n")}`
		);
	}
	if (ctx.relevantMemories.length > 0) {
		parts.push(
			`Relevant memories:\n${ctx.relevantMemories.filter(Boolean).map(sanitizeMemoryString).join("\n")}`
		);
	}

	if (parts.length === 0) {
		return "";
	}

	return `<user-memory>
${parts.join("\n\n")}
</user-memory>`;
}
