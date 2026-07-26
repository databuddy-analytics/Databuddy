import { type Tool, tool } from "ai";
import { z } from "zod";
import {
	forgetMemory,
	isMemoryEnabled,
	primaryContainerTag,
	sanitizeMemoryContent,
	saveCuratedMemory,
	searchMemories,
} from "../../lib/supermemory";

function getAgentContext(options: unknown): {
	apiKeyId: string | null;
	memoryUserId: string | null;
	mutationMode: "allow" | "dry-run";
	websiteId: string | null;
} {
	const ctx = (options as { experimental_context?: Record<string, unknown> })
		?.experimental_context;
	const userId =
		typeof ctx?.userId === "string" && ctx.userId ? ctx.userId : null;
	const memoryUserId =
		typeof ctx?.memoryUserId === "string" && ctx.memoryUserId
			? ctx.memoryUserId
			: userId;
	const apiKey = ctx?.apiKey as { id: string } | null | undefined;
	const websiteId =
		typeof ctx?.websiteId === "string" && ctx.websiteId ? ctx.websiteId : null;
	const mutationMode = ctx?.mutationMode === "dry-run" ? "dry-run" : "allow";
	return {
		apiKeyId: apiKey?.id ?? null,
		memoryUserId,
		mutationMode,
		websiteId,
	};
}

export function createMemoryTools(): Record<string, Tool> {
	if (!isMemoryEnabled()) {
		return {};
	}

	return {
		search_memory: tool({
			description:
				"Search past conversation memory only when the latest user message explicitly asks about remembered preferences, prior saved context, previous conversations, or what you know/remember about them. Do not use for generic corrections, frustration, acknowledgments, or current Slack thread context.",
			strict: true,
			inputSchema: z.object({
				query: z.string(),
				limit: z.number().min(1).max(10).optional().default(5),
			}),
			execute: async (args, options) => {
				const { apiKeyId, memoryUserId, websiteId } = getAgentContext(options);
				const results = await searchMemories(
					args.query,
					memoryUserId,
					apiKeyId,
					{
						limit: args.limit,
						threshold: 0.4,
						websiteId: websiteId ?? undefined,
					}
				);

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
				"Save an important user preference, correction, or project fact for future conversations.",
			strict: true,
			inputSchema: z.object({
				content: z.string(),
				category: z
					.enum(["preference", "insight", "pattern", "alert", "context"])
					.optional()
					.default("insight"),
			}),
			execute: (args, options) => {
				const { apiKeyId, memoryUserId, mutationMode, websiteId } =
					getAgentContext(options);
				if (mutationMode === "dry-run") {
					return {
						dryRun: true,
						message: "Dry-run mode skipped saving memory.",
						saved: false,
					};
				}
				saveCuratedMemory(args.content, memoryUserId, apiKeyId, {
					category: args.category ?? "insight",
					websiteId: websiteId ?? undefined,
				});
				return { saved: true };
			},
		}),
		forget_memory: tool({
			description:
				"Delete an incorrect or outdated saved memory only when the latest user message explicitly says a remembered/saved memory is wrong or asks you to forget it. Do not use for generic corrections or current Slack thread context.",
			strict: true,
			inputSchema: z.object({
				query: z.string().describe("Search query to find the memory to forget"),
			}),
			execute: async (args, options) => {
				const { apiKeyId, memoryUserId, mutationMode, websiteId } =
					getAgentContext(options);
				if (mutationMode === "dry-run") {
					return {
						dryRun: true,
						forgotten: false,
						message: "Dry-run mode skipped forgetting memory.",
					};
				}
				const results = await searchMemories(
					args.query,
					memoryUserId,
					apiKeyId,
					{
						limit: 1,
						threshold: 0.3,
						websiteId: websiteId ?? undefined,
					}
				);
				if (results.length === 0 || !results[0]) {
					return {
						forgotten: false,
						message: "No matching memory found to forget.",
					};
				}
				const containerTag =
					results[0].containerTag ??
					primaryContainerTag(memoryUserId, apiKeyId);
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
