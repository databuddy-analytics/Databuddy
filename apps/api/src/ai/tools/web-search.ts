import { getAutumn } from "@databuddy/rpc";
import { generateText, tool } from "ai";
import { z } from "zod";
import { getAILogger } from "../config/ai-logger";
import { mergeWideEvent } from "../../lib/tracing";
import type { AppContext } from "../config/context";
import { models } from "../config/models";
import { createToolLogger } from "./utils/logger";

const logger = createToolLogger("Web Search");

export const webSearchTool = tool({
	description:
		"Search the web for external context: benchmarks, best practices, competitors, industry info. Never for analytics data.",
	inputSchema: z.object({
		query: z.string(),
		context: z.string().optional(),
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
				model: getAILogger().wrap(models.perplexity),
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

			if (appContext?.billingCustomerId) {
				getAutumn()
					.track({
						customerId: appContext.billingCustomerId,
						featureId: "agent_web_search_calls",
						value: 1,
					})
					.catch((trackError) => {
						mergeWideEvent({ web_search_billing_track_failed: true });
						logger.error("Failed to track web search usage", {
							error:
								trackError instanceof Error
									? trackError.message
									: String(trackError),
						});
					});
			}

			// Sanitize web content before returning to the agent to prevent
			// indirect prompt injection from adversarial web pages.
			const sanitized = result.text.replace(
				/<\/?[a-z_][a-z_0-9-]*(?:\s[^>]*)?\s*\/?>/gi,
				""
			);

			return {
				answer: sanitized,
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
