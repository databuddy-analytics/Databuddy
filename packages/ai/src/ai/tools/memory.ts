import { type Tool, tool } from "ai";
import { z } from "zod";
import {
	asksToForget,
	asksToRemember,
	forgetMemory,
	isMemoryEnabled,
	sanitizeMemoryContent,
	saveCuratedMemory,
	searchMemories,
} from "../../lib/supermemory";

function getAgentContext(options: unknown): {
	apiKeyId: string | null;
	latestUserMessage: string;
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
	const latestUserMessage =
		typeof ctx?.latestUserMessage === "string" ? ctx.latestUserMessage : "";
	const mutationMode = ctx?.mutationMode === "dry-run" ? "dry-run" : "allow";
	return {
		apiKeyId: apiKey?.id ?? null,
		latestUserMessage,
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
				"Save a user preference, correction, or project fact for future conversations, only when the latest user message explicitly asks you to remember it.",
			strict: true,
			inputSchema: z.object({
				content: z.string(),
				category: z
					.enum(["preference", "insight", "pattern", "alert", "context"])
					.optional()
					.default("insight"),
			}),
			execute: (args, options) => {
				const {
					apiKeyId,
					latestUserMessage,
					memoryUserId,
					mutationMode,
					websiteId,
				} = getAgentContext(options);
				if (mutationMode === "dry-run") {
					return {
						dryRun: true,
						message: "Dry-run mode skipped saving memory.",
						saved: false,
					};
				}
				if (!asksToRemember(latestUserMessage)) {
					return {
						message:
							'Refused: the user\'s latest message does not ask you to remember anything. Memory is saved only when the user explicitly asks, for example "remember that...".',
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
				"Delete one of the user's own saved memories only when the latest user message explicitly names its exact text in a memory deletion or correction request. For an unnamed or shorthand subject, use search_memory and ask the user to identify the exact memory. Fuzzy matches return candidates without deletion. Do not use for generic corrections or current Slack thread context.",
			strict: true,
			inputSchema: z.object({
				query: z.string().describe("Exact text of the saved memory to forget"),
			}),
			execute: async (args, options) => {
				const { apiKeyId, latestUserMessage, memoryUserId, mutationMode } =
					getAgentContext(options);
				if (mutationMode === "dry-run") {
					return {
						dryRun: true,
						forgotten: false,
						message: "Dry-run mode skipped forgetting memory.",
					};
				}
				if (!asksToForget(latestUserMessage, args.query)) {
					return {
						forgotten: false,
						message:
							"Refused: the user's latest message does not explicitly request forgetting this exact memory. Use search_memory to find candidates and ask the user to name the memory to forget.",
					};
				}
				const result = await forgetMemory(args.query, memoryUserId, apiKeyId);
				if (result.status === "forgotten") {
					return {
						forgotten: true,
						memory: result.memory,
						message: "Memory forgotten.",
					};
				}
				if (result.status === "failed") {
					return { forgotten: false, message: "Failed to forget memory." };
				}
				if (result.candidates.length === 0) {
					return {
						forgotten: false,
						message: "No matching memory found to forget.",
					};
				}
				return {
					candidates: result.candidates,
					forgotten: false,
					message:
						"No saved memory has that exact text. Ask the user to name the exact candidate they want forgotten before calling forget_memory again.",
				};
			},
		}),
	};
}
