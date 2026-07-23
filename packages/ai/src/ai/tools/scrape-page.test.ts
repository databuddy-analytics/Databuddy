import { afterEach, describe, expect, it } from "bun:test";
import type { AppContext } from "../config/context";
import { createScrapeTools } from "./scrape-page";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;

const BASE_CONTEXT: AppContext = {
	chatId: "shadow-test",
	currentDateTime: "2026-07-20T00:00:00.000Z",
	timezone: "UTC",
	userId: "system",
	websiteDomain: "example.com",
	websiteId: "website_123",
};

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	if (ORIGINAL_FIRECRAWL_KEY === undefined) {
		delete process.env.FIRECRAWL_API_KEY;
	} else {
		process.env.FIRECRAWL_API_KEY = ORIGINAL_FIRECRAWL_KEY;
	}
});

async function runScrape(mutationMode: AppContext["mutationMode"]) {
	const writes: string[] = [];
	const scrape = createScrapeTools({
		read: () => Promise.resolve(null),
		write: (_key, value) => writes.push(value),
	}).scrape_page;
	if (!scrape.execute) {
		throw new Error("scrape_page is not executable");
	}

	await scrape.execute(
		{ path: "/" },
		{
			experimental_context: { ...BASE_CONTEXT, mutationMode },
			messages: [],
			toolCallId: "scrape-1",
		}
	);
	return writes;
}

describe("scrape_page cache", () => {
	it("does not write cache entries in dry-run mode", async () => {
		process.env.FIRECRAWL_API_KEY = "test-key";
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					data: {
						links: ["https://example.com/pricing"],
						markdown: "# Example",
						metadata: { statusCode: 200, title: "Example" },
					},
					success: true,
				})
			);

		expect(await runScrape("dry-run")).toEqual([]);
		expect(await runScrape("execute")).toHaveLength(1);
	});
});
