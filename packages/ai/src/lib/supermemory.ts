import { config } from "@databuddy/env/app";
import { getMemoryClient } from "@databuddy/services/business-memory";
export { getMemoryClient } from "@databuddy/services/business-memory";
import { stripHtmlTags } from "./sanitize";

const MAX_MEMORY_LENGTH = 2000;
const MEMORY_REQUEST_CLAUSE = /[^.!?;:,\n]+\??/g;
const MEMORY_REQUEST_FILLER =
	/^(?:(?:please|pls|plz|kindly|also|and|but|so|ok|okay|hey|hi|hello|btw|oh|now|just|thanks|thank you|databunny)\b\s*)+/i;
const MEMORY_REQUEST_LEAD_IN =
	/^(?:(?:can|could|would|will) you|you (?:can|should|must|need to)|i (?:want|need) you to|i(?:['’]d| would) like you to|make sure (?:to|you)|be sure to)\s+(?:please\s+)?/i;
const QUESTION_START =
	/^(?:what|how|why|when|where|who|whom|whose|which|is|are|am|was|were|will|would|does|did|can|could|should|has|have|had|do(?! not\b))\b/i;
const REMEMBER_REQUESTS = [
	/^(?:remember|memori[sz]e)\b(?![\s-]*(?:me|when|what|how|why|where|who|which|whether|if)\b)/,
	/^(?:don't|dont|do not|never) forget\b/,
	/^(?:note (?:that|this|down)|make a note|take note)\b/,
	/^save (?:this|that|it)(?: for (?:later|next time|the future))?$/,
	/^(?:save|store|add|put|keep|commit|write)\b.*\b(?:to|in|into) (?:your |the )?memory\b/,
	/^(?:keep|bear) (?:(?:this|that|it) )?in mind\b/,
	/^my name(?: is|'s)\b/,
	/^(?:i|we)(?:'d| would)? prefer\b/,
	/^call me\b/,
	/\bfrom now on\b/,
];
const FORGET_MEMORY_PREFIX =
	/^(?:(?:forget|unlearn|delete|remove|erase|clear|drop|wipe)\s+(?:(?:my|your|the|this|that)\s+)?(?:(?:saved|stored|remembered)\s+(?:memory|preference|fact|note)|memory)\b[\s:]+|stop remembering\s+)/i;
const FORGET_COMMAND_PREFIX =
	/^(?:forget|unlearn|delete|remove|erase|clear|drop|wipe)\s+/i;
const FROM_MEMORY_SUFFIX = /(?<=\s)from\s+(?:(?:my|your|the)\s+)?memory$/i;
const MEMORY_CORRECTION_PREFIX =
	/^(?:(?:this|that|the|your|my)\s+)?(?:(?:saved|stored|remembered)\s+)?memory\b[\s:]+/i;
const REMEMBERED_CORRECTION_PREFIX =
	/^(?:you|you['’]ve|you have)\s+(?:remembered|saved|noted|stored)\s+/i;
const MEMORY_CORRECTION_SUFFIX =
	/(?<=\s)(?:is|are|was|were)\s+(?:wrong|incorrect|outdated|stale|out of date|no longer (?:true|right|correct))$/i;
const REMEMBERED_CORRECTION_SUFFIX =
	/(?<=\s)(?:wrong|incorrect|outdated|stale|out of date|no longer (?:true|right|correct))$/i;
const NEGATED_CORRECTION_SUFFIX =
	/(?<=\s)(?:not|never|no longer)\s+(?:wrong|incorrect|outdated|stale|out of date|no longer (?:true|right|correct))$/i;
const MEMORY_REQUEST_END = /[.!?]$/;
const QUOTED_FORGET_PREFIX = /^(?:forget|unlearn)\s+/i;
const MEMORY_TARGET_QUOTE = /^["'“‘`]/;
const UNNAMED_MEMORY_TARGET = /^(?:this|that|it|these|those|all)$/i;
const FORGET_ACKNOWLEDGEMENT =
	/^(?:(?:thanks|thank you|ok|okay|got it)[.!]\s*)+/i;

export function isMemoryEnabled(): boolean {
	return Boolean(config.services.supermemoryApiKey);
}

export function sanitizeMemoryContent(
	value: string,
	maxLength = MAX_MEMORY_LENGTH
): string {
	return stripHtmlTags(value, maxLength);
}

export function asksToRemember(message: string): boolean {
	const clauses =
		message.toLowerCase().replaceAll("’", "'").match(MEMORY_REQUEST_CLAUSE) ??
		[];
	return clauses.some((part) => {
		const question = part.endsWith("?");
		const clause = part
			.replace("?", "")
			.trim()
			.replace(MEMORY_REQUEST_FILLER, "");
		const request = clause.replace(MEMORY_REQUEST_LEAD_IN, "");
		if ((question && request === clause) || QUESTION_START.test(request)) {
			return false;
		}
		return REMEMBER_REQUESTS.some((pattern) => pattern.test(request));
	});
}

export function asksToForget(message: string, query: string): boolean {
	const target = query.trim();
	const clause = message
		.trim()
		.replace(FORGET_ACKNOWLEDGEMENT, "")
		.replace(MEMORY_REQUEST_FILLER, "");
	const request = clause.replace(MEMORY_REQUEST_LEAD_IN, "");
	if (
		!target ||
		QUESTION_START.test(request) ||
		(request === clause && request.endsWith("?"))
	) {
		return false;
	}
	const quotedTargets = [
		`"${target}"`,
		`'${target}'`,
		`“${target}”`,
		`‘${target}’`,
		`\`${target}\``,
	];

	// Only strip sentence punctuation outside a quoted target; its content stays exact.
	return [request, request.replace(MEMORY_REQUEST_END, "").trimEnd()].some(
		(command) => {
			const memoryPrefix = command.match(FORGET_MEMORY_PREFIX)?.[0];
			const memoryCorrectionPrefix = command.match(
				MEMORY_CORRECTION_PREFIX
			)?.[0];
			const correctionPrefix =
				memoryCorrectionPrefix ??
				command.match(REMEMBERED_CORRECTION_PREFIX)?.[0];
			const correctionSuffix = command.match(
				memoryCorrectionPrefix
					? MEMORY_CORRECTION_SUFFIX
					: REMEMBERED_CORRECTION_SUFFIX
			)?.[0];
			const commandPrefix = command.match(FORGET_COMMAND_PREFIX)?.[0];
			const fromMemorySuffix = command.match(FROM_MEMORY_SUFFIX)?.[0];
			let object: string;
			let quotedOnly = false;
			if (memoryPrefix) {
				object = command.slice(memoryPrefix.length);
			} else if (correctionPrefix && correctionSuffix) {
				if (NEGATED_CORRECTION_SUFFIX.test(command)) {
					return false;
				}
				object = command.slice(
					correctionPrefix.length,
					-correctionSuffix.length
				);
			} else if (commandPrefix && fromMemorySuffix) {
				object = command.slice(commandPrefix.length, -fromMemorySuffix.length);
			} else if (QUOTED_FORGET_PREFIX.test(command) && commandPrefix) {
				object = command.slice(commandPrefix.length);
				quotedOnly = true;
			} else {
				return false;
			}
			object = object.trim();
			if (quotedTargets.includes(object)) {
				return object.indexOf(object.slice(-1), 1) === object.length - 1;
			}
			return (
				!quotedOnly &&
				object === target &&
				!MEMORY_TARGET_QUOTE.test(object) &&
				!UNNAMED_MEMORY_TARGET.test(object)
			);
		}
	);
}

export type MemoryContainerKind = "apikey" | "user";

export function memoryContainerTag(
	kind: MemoryContainerKind,
	id: string
): string {
	return `${kind}_${id}`;
}

function identityContainerTag(
	userId: string | null,
	apiKeyId: string | null
): string | null {
	if (userId) {
		return memoryContainerTag("user", userId);
	}
	if (apiKeyId) {
		return memoryContainerTag("apikey", apiKeyId);
	}
	return null;
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
	memory: string;
	similarity: number;
}

export type ForgetMemoryResult =
	| { status: "failed" }
	| { memory: string; status: "forgotten" }
	| { candidates: string[]; status: "not_found" };

export async function getMemoryContext(
	query: string,
	userId: string | null,
	apiKeyId: string | null,
	options?: { threshold?: number }
): Promise<MemoryContext> {
	const client = getMemoryClient();
	const containerTag = identityContainerTag(userId, apiKeyId);
	if (!(client && containerTag)) {
		return { staticProfile: [], dynamicProfile: [], relevantMemories: [] };
	}

	try {
		const profile = await client.profile({
			containerTag,
			q: query,
			threshold: options?.threshold ?? 0.25,
		});

		const searchResults = (profile.searchResults?.results ?? []) as Array<{
			memory?: string;
			chunk?: string;
		}>;

		return {
			staticProfile: uniqueNonEmpty(profile.profile.static),
			dynamicProfile: uniqueNonEmpty(profile.profile.dynamic),
			relevantMemories: uniqueNonEmpty(
				searchResults.map((r) => r.memory ?? r.chunk ?? "")
			),
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
	const client = getMemoryClient();
	const containerTag = identityContainerTag(userId, apiKeyId);
	if (!(client && containerTag)) {
		return;
	}

	const content = conversation.map((m) => `${m.role}: ${m.content}`).join("\n");

	const domain = options?.domain ?? "unknown";
	const entityContext = `Analytics conversation about ${domain}. Extract user preferences, KPIs they track, alerts they care about, and recurring questions.`;

	client
		.add({
			content,
			containerTag,
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

export function saveCuratedMemory(
	content: string,
	userId: string | null,
	apiKeyId: string | null,
	options?: {
		category?: string;
		websiteId?: string;
	}
): void {
	const client = getMemoryClient();
	const containerTag = identityContainerTag(userId, apiKeyId);
	if (!(client && containerTag)) {
		return;
	}

	client
		.add({
			content: sanitizeMemoryContent(content),
			containerTag,
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
	const client = getMemoryClient();
	const containerTag = identityContainerTag(userId, apiKeyId);
	if (!(client && containerTag)) {
		return [];
	}

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
		const { results } = await client.search.memories({
			q: query,
			containerTag,
			searchMode: "hybrid",
			limit: options?.limit ?? 5,
			threshold: options?.threshold ?? 0.4,
			...(filters && { filters }),
		});

		return results
			.flatMap((r) => {
				const memory = r.memory ?? r.chunk;
				return memory ? [{ memory, similarity: r.similarity }] : [];
			})
			.sort((a, b) => b.similarity - a.similarity);
	} catch {
		return [];
	}
}

export async function forgetMemory(
	memory: string,
	userId: string | null,
	apiKeyId: string | null
): Promise<ForgetMemoryResult> {
	const client = getMemoryClient();
	const containerTag = identityContainerTag(userId, apiKeyId);
	if (!(client && containerTag)) {
		return { candidates: [], status: "not_found" };
	}

	try {
		const { results } = await client.search.memories({
			q: memory,
			containerTag,
			searchMode: "memories",
			limit: 5,
			threshold: 0.3,
		});
		const candidates = results.flatMap((r) =>
			r.memory ? [{ id: r.id, memory: sanitizeMemoryContent(r.memory) }] : []
		);
		const target = sanitizeMemoryContent(memory).trim();
		const match = candidates.find(
			(candidate) => candidate.memory.trim() === target
		);
		if (!match) {
			return {
				candidates: candidates.map((candidate) => candidate.memory),
				status: "not_found",
			};
		}
		await client.memories.forget({ containerTag, id: match.id });
		return { memory: match.memory, status: "forgotten" };
	} catch {
		return { status: "failed" };
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
