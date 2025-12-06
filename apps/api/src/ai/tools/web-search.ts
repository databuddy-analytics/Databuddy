import FirecrawlApp from "@mendable/firecrawl-js";
import { tool } from "ai";
import { z } from "zod";

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
