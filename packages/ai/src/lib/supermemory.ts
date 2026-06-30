import Supermemory from "supermemory";
import { stripHtmlTags } from "./sanitize";

const apiKey = process.env.SUPERMEMORY_API_KEY;
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
	return stripHtmlTags(value, maxLength);
}

export type MemoryContainerKind = "apikey" | "user" | "website";

export function memoryContainerTag(
	kind: MemoryContainerKind,
	id: string
): string {
	return `${kind}_${id}`;
}

function buildContainerTags(
	userId: string | null,
	apiKeyId: string | null,
	websiteId?: string | null
): string[] {
	const tags = [primaryContainerTag(userId, apiKeyId)];
	if (websiteId) {
		tags.push(memoryContainerTag("website", websiteId));
	}
	return [...new Set(tags)];
}

export function primaryContainerTag(
	userId: string | null,
	apiKeyId: string | null
): string {
	if (userId) {
		return memoryContainerTag("user", userId);
	}
	if (apiKeyId) {
		return memoryContainerTag("apikey", apiKeyId);
	}
	return "anonymous";
}

function readContainerTags(
	userId: string | null,
	apiKeyId: string | null,
	websiteId?: string | null
): string[] {
	return buildContainerTags(userId, apiKeyId, websiteId);
}

function uniqueNonEmpty(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

export interface MemoryContext {
	dynamicProfile: string[];
	relevantMemories: string[];
	staticProfile: string[];
}

export interface MemorySearchResult {
	containerTag: string;
	memory: string;
	similarity: number;
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

	const containerTags = readContainerTags(userId, apiKeyId, options?.websiteId);
	const threshold = options?.threshold ?? 0.25;

	try {
		const profiles = await Promise.all(
			containerTags.map((containerTag) =>
				client
					.profile({
						containerTag,
						q: query,
						threshold,
					})
					.catch(() => null)
			)
		);

		const searchResults = profiles.flatMap((profile) =>
			(
				(profile?.searchResults?.results ?? []) as Array<{
					memory?: string;
					chunk?: string;
				}>
			).map((r) => r.memory ?? r.chunk ?? "")
		);

		return {
			staticProfile: uniqueNonEmpty(
				profiles.flatMap((profile) => profile?.profile?.static ?? [])
			),
			dynamicProfile: uniqueNonEmpty(
				profiles.flatMap((profile) => profile?.profile?.dynamic ?? [])
			),
			relevantMemories: uniqueNonEmpty(searchResults),
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
			content: sanitizeMemoryContent(summary),
			containerTag: memoryContainerTag("website", websiteId),
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
): Promise<MemorySearchResult[]> {
	const client = getClient();
	if (!client) {
		return [];
	}

	const primaryTag = primaryContainerTag(userId, apiKeyId);
	const websiteTag = options?.websiteId
		? memoryContainerTag("website", options.websiteId)
		: null;
	const containerTags = websiteTag
		? [...new Set([primaryTag, websiteTag])]
		: [primaryTag];

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
		const limit = options?.limit ?? 5;
		const results = await Promise.all(
			containerTags.map((containerTag) =>
				client.search.memories({
					q: query,
					containerTag,
					searchMode: "hybrid",
					limit,
					threshold: options?.threshold ?? 0.4,
					...(containerTag === primaryTag && filters ? { filters } : {}),
				})
			)
		);

		const deduped = new Map<string, MemorySearchResult>();
		for (let i = 0; i < results.length; i++) {
			const containerTag = containerTags[i] ?? primaryTag;
			for (const r of results[i]?.results ?? []) {
				const memory = r.memory ?? r.chunk ?? "";
				if (!memory) {
					continue;
				}
				const similarity = r.similarity;
				const existing = deduped.get(memory);
				if (!(existing && existing.similarity >= similarity)) {
					deduped.set(memory, { containerTag, memory, similarity });
				}
			}
		}

		return [...deduped.values()]
			.sort((a, b) => b.similarity - a.similarity)
			.slice(0, limit);
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
