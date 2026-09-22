import { expect, it } from "bun:test";
import { readWebsitePage } from "./scrape-page";

it.skipIf(process.env.WEBSITE_READER_INTEGRATION_TESTS !== "true")(
	"round-trips the production Redis cache with the original page timestamp and TTL",
	async () => {
		const endpoint = new URL(process.env.REDIS_URL ?? "redis://invalid");
		if (!["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) {
			throw new Error(
				"Website reader integration tests require a local Redis instance"
			);
		}
		const { redis } = await import("@databuddy/redis/redis");
		const domain = `reader-${crypto.randomUUID()}.example`;
		const key = `scrape:${domain}:/`;
		const originalFetch = globalThis.fetch;
		const originalKey = process.env.FIRECRAWL_API_KEY;
		let calls = 0;
		try {
			process.env.FIRECRAWL_API_KEY = "test-key";
			globalThis.fetch = async () => {
				calls += 1;
				return Response.json({
					success: true,
					data: {
						markdown: "# Example service",
						metadata: {
							url: `https://${domain}/`,
							title: "Example",
							statusCode: 200,
						},
					},
				});
			};
			const first = await readWebsitePage({ domain });
			if (!first.success) {
				throw new Error(first.error);
			}
			// Cache writes are best effort and intentionally do not delay the page read.
			let stored = await redis.get(key);
			for (let attempt = 0; !stored && attempt < 100; attempt += 1) {
				await Bun.sleep(10);
				stored = await redis.get(key);
			}
			expect(JSON.parse(stored ?? "null")).toEqual(first);
			expect(await redis.ttl(key)).toBeGreaterThan(86_390);
			expect(await redis.ttl(key)).toBeLessThanOrEqual(86_400);
			expect(await readWebsitePage({ domain })).toEqual({
				...first,
				cached: true,
			});
			expect(calls).toBe(1);
			await redis.del(key);
			expect(
				(await readWebsitePage({ domain, mutationMode: "dry-run" })).success
			).toBe(true);
			expect(await redis.get(key)).toBeNull();
		} finally {
			globalThis.fetch = originalFetch;
			if (originalKey === undefined) {
				delete process.env.FIRECRAWL_API_KEY;
			} else {
				process.env.FIRECRAWL_API_KEY = originalKey;
			}
			await redis.del(key);
			await redis.quit();
		}
	},
	15_000
);
