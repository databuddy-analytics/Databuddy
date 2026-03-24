import { type Tool, tool } from "ai";
import { z } from "zod";
import {
	isMemoryEnabled,
	searchMemories,
	storeConversation,
} from "../../lib/supermemory";

function getAgentContext(options: unknown): {
	userId: string | null;
	apiKeyId: string | null;
} {
	const ctx = (options as { experimental_context?: Record<string, unknown> })
		?.experimental_context;
	const userId =
		typeof ctx?.userId === "string" && ctx.userId ? ctx.userId : null;
	const apiKey = ctx?.apiKey as { id: string } | null | undefined;
	return { userId, apiKeyId: apiKey?.id ?? null };
}

export function createMemoryTools(): Record<string, Tool> {
	if (!isMemoryEnabled()) {
		return {};
	}

	return {
		search_memory: tool({
			description:
				"Search your memory of past conversations with this user. Use when you need context about their preferences, past questions, patterns, or previous analytics findings. Returns relevant memories ranked by similarity.",
			strict: true,
			inputSchema: z.object({
				query: z
					.string()
					.describe(
						"What to search for in memory (e.g. 'pricing page performance', 'user preferences', 'previous traffic issues')"
					),
				limit: z
					.number()
					.min(1)
					.max(10)
					.optional()
					.default(5)
					.describe("Max number of memories to return"),
			}),
			execute: async (args, options) => {
				const { userId, apiKeyId } = getAgentContext(options);
				const results = await searchMemories(args.query, userId, apiKeyId, {
					limit: args.limit,
					threshold: 0.4,
				});

				if (results.length === 0) {
					return { found: false, message: "No relevant memories found." };
				}

				return {
					found: true,
					memories: results.map((r) => ({
						content: r.memory,
						relevance: Math.round(r.similarity * 100),
					})),
				};
			},
		}),
		save_memory: tool({
			description:
				"Save an important insight, user preference, or finding to memory for future conversations. Use when the user shares preferences, you discover important patterns, or want to remember key findings.",
			strict: true,
			inputSchema: z.object({
				content: z
					.string()
					.describe(
						"The insight or information to remember (e.g. 'User cares most about /pricing page bounce rate', 'Traffic drops every Monday')"
					),
				category: z
					.enum(["preference", "insight", "pattern", "alert", "context"])
					.optional()
					.default("insight")
					.describe("Category of the memory"),
			}),
			execute: (args, options) => {
				const { userId, apiKeyId } = getAgentContext(options);
				storeConversation(
					[{ role: "assistant", content: args.content }],
					userId,
					apiKeyId,
					{ category: args.category ?? "insight" }
				);
				return { saved: true };
			},
		}),
	};
}
