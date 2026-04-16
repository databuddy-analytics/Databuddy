import { type Tool, tool } from "ai";
import { z } from "zod";
import {
	forgetMemory,
	isMemoryEnabled,
	sanitizeMemoryContent,
	saveCuratedMemory,
	searchMemories,
} from "../../lib/supermemory";

function getAgentContext(options: unknown): {
	userId: string | null;
	apiKeyId: string | null;
	websiteId: string | null;
} {
	const ctx = (options as { experimental_context?: Record<string, unknown> })
		?.experimental_context;
	const userId =
		typeof ctx?.userId === "string" && ctx.userId ? ctx.userId : null;
	const apiKey = ctx?.apiKey as { id: string } | null | undefined;
	const websiteId =
		typeof ctx?.websiteId === "string" && ctx.websiteId ? ctx.websiteId : null;
	return { userId, apiKeyId: apiKey?.id ?? null, websiteId };
}

export function createMemoryTools(): Record<string, Tool> {
	if (!isMemoryEnabled()) {
		return {};
	}

	return {
		search_memory: tool({
			description:
				"Search past conversation memory for this user's preferences, patterns, or prior findings.",
			strict: true,
			inputSchema: z.object({
				query: z.string(),
				limit: z.number().min(1).max(10).optional().default(5),
			}),
			execute: async (args, options) => {
				const { userId, apiKeyId, websiteId } = getAgentContext(options);
				const results = await searchMemories(args.query, userId, apiKeyId, {
					limit: args.limit,
					threshold: 0.4,
					websiteId: websiteId ?? undefined,
				});

				if (results.length === 0) {
					return { found: false, message: "No relevant memories found." };
				}

				return {
					found: true,
					memories: results.map((r) => ({
						content: sanitizeMemoryContent(r.memory),
						relevance: Math.round(r.similarity * 100),
					})),
				};
			},
		}),
		save_memory: tool({
			description:
				"Save an important user preference, pattern, or finding for future conversations.",
			strict: true,
			inputSchema: z.object({
				content: z.string(),
				category: z
					.enum(["preference", "insight", "pattern", "alert", "context"])
					.optional()
					.default("insight"),
			}),
			execute: (args, options) => {
				const { userId, apiKeyId, websiteId } = getAgentContext(options);
				saveCuratedMemory(args.content, userId, apiKeyId, {
					category: args.category ?? "insight",
					websiteId: websiteId ?? undefined,
				});
				return { saved: true };
			},
		}),
		forget_memory: tool({
			description:
				"Delete an incorrect or outdated memory. Use when the user says something previously saved is wrong.",
			strict: true,
			inputSchema: z.object({
				query: z.string().describe("Search query to find the memory to forget"),
			}),
			execute: async (args, options) => {
				const { userId, apiKeyId } = getAgentContext(options);
				const results = await searchMemories(args.query, userId, apiKeyId, {
					limit: 1,
					threshold: 0.3,
				});
				if (results.length === 0 || !results[0]) {
					return {
						forgotten: false,
						message: "No matching memory found to forget.",
					};
				}
				const containerTag = userId
					? `user:${userId}`
					: apiKeyId
						? `apikey:${apiKeyId}`
						: "anonymous";
				const result = await forgetMemory(containerTag, results[0].memory);
				return {
					forgotten: result.success,
					message: result.success
						? "Memory forgotten."
						: "Failed to forget memory.",
				};
			},
		}),
	};
}
