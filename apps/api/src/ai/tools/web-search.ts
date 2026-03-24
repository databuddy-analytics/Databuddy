import { generateText, tool } from "ai";
import { z } from "zod";
import type { AppContext } from "../config/context";
import { models } from "../config/models";
import { createToolLogger } from "./utils/logger";

const logger = createToolLogger("Web Search");

export const webSearchTool = tool({
	description:
		"Search the web for real-time information. Use this when the user's question requires external context you don't have - e.g. industry benchmarks, best practices for a specific technology, competitor info, marketing advice, SEO tips, or anything beyond the analytics data. Do NOT use this for analytics queries - use the analytics tools instead.",
	inputSchema: z.object({
		query: z
			.string()
			.describe(
				"A clear, specific search query. Good: 'average bounce rate for SaaS websites 2025'. Bad: 'bounce rate'."
			),
		context: z
			.string()
			.optional()
			.describe(
				"Brief context about why you're searching, to help refine the answer"
			),
	}),
	execute: async ({ query, context }, options) => {
		const searchStart = Date.now();

		try {
			const systemPrompt = context
				? `You are a research assistant. The user is analyzing their website analytics and needs external context. Their specific situation: ${context}. Provide a concise, factual answer focused on actionable information. No fluff.`
				: "You are a research assistant. Provide a concise, factual answer focused on actionable information. No fluff.";

			const appContext =
				"experimental_context" in (options as object)
					? (options as { experimental_context?: AppContext })
							.experimental_context
					: undefined;

			const webSearchMetadata: Record<string, string> = {
				source: "agent_tool",
				tool: "web_search",
			};
			if (appContext?.userId) {
				webSearchMetadata.userId = appContext.userId;
			}
			if (appContext?.websiteId) {
				webSearchMetadata.websiteId = appContext.websiteId;
			}
			if (appContext?.websiteDomain) {
				webSearchMetadata.websiteDomain = appContext.websiteDomain;
			}
			if (appContext?.timezone) {
				webSearchMetadata.timezone = appContext.timezone;
			}
			if (appContext?.chatId) {
				webSearchMetadata["tcc.sessionId"] = appContext.chatId;
				webSearchMetadata["tcc.conversational"] = "true";
			}

			const result = await generateText({
				model: models.perplexity,
				system: systemPrompt,
				prompt: query,
				experimental_telemetry: {
					isEnabled: true,
					functionId: "databuddy.agent.web_search",
					metadata: webSearchMetadata,
				},
			});

			const executionTime = Date.now() - searchStart;

			logger.info("Web search completed", {
				query,
				executionTime: `${executionTime}ms`,
				responseLength: result.text.length,
			});

			return {
				answer: result.text,
				query,
				executionTime,
			};
		} catch (error) {
			const executionTime = Date.now() - searchStart;

			logger.error("Web search failed", {
				query,
				executionTime: `${executionTime}ms`,
				error: error instanceof Error ? error.message : "Unknown error",
			});

			throw error instanceof Error
				? error
				: new Error("Web search failed. Please try again.");
		}
	},
});
