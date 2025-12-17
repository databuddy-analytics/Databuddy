import FirecrawlApp from "@mendable/firecrawl-js";
import { generateText, tool } from "ai";
import { z } from "zod";
import { models } from "../config/models";

/**
 * Web search tool using Firecrawl for scraping and crawling websites.
 * Provides markdown and HTML content from crawled URLs.
 */
export const webSearchTool = tool({
	description:
		"Search the web for up-to-date information by crawling and scraping websites",
	inputSchema: z.object({
		urlToCrawl: z
			.url()
			.min(1)
			.max(100)
			.describe("The URL to crawl (including http:// or https://)"),
	}),
	execute: async ({ urlToCrawl }) => {
		const app = new FirecrawlApp({
			apiKey: process.env.FIRECRAWL_API_KEY,
		});

		const crawlResponse = await app.scrape(urlToCrawl, {
			formats: ["markdown", "html"],
		});

		return crawlResponse;
	},
});

/**
 * Competitor analysis tool using Perplexity for real-time web search and analysis.
 * Provides grounded insights with citations about competitors and market trends.
 */
export const competitorAnalysisTool = tool({
	description:
		"Analyze competitors, market trends, and industry insights using real-time web search with citations",
	inputSchema: z.object({
		query: z
			.string()
			.min(1)
			.max(500)
			.describe(
				"The competitor analysis query (e.g., 'competitors to example.com in analytics space')"
			),
		context: z
			.string()
			.optional()
			.describe("Additional context about what you're analyzing"),
	}),
	execute: async ({ query, context }) => {
		const fullQuery = context ? `${query}. Context: ${context}` : query;

		const result = await generateText({
			model: models.perplexity,
			prompt: fullQuery,
		});

		return {
			analysis: result.text || "",
			sources: (result as any).sources || [],
			query: fullQuery,
		};
	},
});
