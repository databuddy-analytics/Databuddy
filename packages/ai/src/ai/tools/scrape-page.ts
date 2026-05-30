import { tool } from "ai";
import { z } from "zod";
import { getWebsiteDomain } from "../../lib/website-utils";
import { getAppContext, resolveToolWebsite } from "./utils";

const FIRECRAWL_API = "https://api.firecrawl.dev/v1";
const MAX_CONTENT_CHARS = 12_000;
const CACHE_TTL_SECONDS = 86_400;

function getFirecrawlKey(): string | null {
	return process.env.FIRECRAWL_API_KEY ?? null;
}

function cacheKey(domain: string, path: string): string {
	return `scrape:${domain}:${path}`;
}

let _redis: typeof import("@databuddy/redis").redis | null = null;
async function getRedis() {
	if (!_redis) {
		try {
			_redis = (await import("@databuddy/redis")).redis;
		} catch {
			return null;
		}
	}
	return _redis;
}

async function getCached(key: string): Promise<string | null> {
	const r = await getRedis();
	if (!r) {
		return null;
	}
	try {
		return await r.get(key);
	} catch {
		return null;
	}
}

async function setCache(key: string, value: string): Promise<void> {
	const r = await getRedis();
	if (!r) {
		return;
	}
	r.set(key, value, "EX", CACHE_TTL_SECONDS).catch(() => {});
}

interface ScrapeResult {
	cached?: boolean;
	content: string;
	description: string | null;
	internalLinks: string[];
	statusCode: number | null;
	title: string | null;
	url: string;
}

async function scrapePage(
	domain: string,
	path: string
): Promise<ScrapeResult | { error: string }> {
	const apiKey = getFirecrawlKey();
	if (!apiKey) {
		return { error: "Page scraping is not configured" };
	}

	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	const key = cacheKey(domain, cleanPath);

	const cached = await getCached(key);
	if (cached) {
		try {
			return { ...(JSON.parse(cached) as ScrapeResult), cached: true };
		} catch {
			// Ignore corrupt cache entries and fetch a fresh copy.
		}
	}

	const url = `https://${domain}${cleanPath}`;

	try {
		const res = await fetch(`${FIRECRAWL_API}/scrape`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				url,
				formats: ["markdown", "links"],
				onlyMainContent: true,
				timeout: 15_000,
			}),
			signal: AbortSignal.timeout(20_000),
		});

		if (!res.ok) {
			const body = await res.text().catch(() => "");
			return {
				error: `Scrape failed (${res.status}): ${body.slice(0, 200)}`,
			};
		}

		const data = (await res.json()) as {
			success: boolean;
			data?: {
				markdown?: string;
				links?: string[];
				metadata?: {
					title?: string;
					description?: string;
					statusCode?: number;
				};
			};
		};

		if (!(data.success && data.data?.markdown)) {
			return { error: "Page returned no content" };
		}

		const markdown = data.data.markdown;
		const meta = data.data.metadata;
		const allLinks = data.data.links ?? [];
		const seen = new Set<string>();
		const internalLinks: string[] = [];
		for (const l of allLinks) {
			let hostname: string;
			let pathname: string;
			try {
				const u = new URL(l);
				hostname = u.hostname;
				pathname = u.pathname;
			} catch {
				if (!l.startsWith("/")) {
					continue;
				}
				hostname = domain;
				pathname = l;
			}
			if (hostname !== domain && hostname !== `www.${domain}`) {
				continue;
			}
			if (seen.has(pathname)) {
				continue;
			}
			seen.add(pathname);
			internalLinks.push(pathname);
			if (internalLinks.length >= 30) {
				break;
			}
		}

		const result: ScrapeResult = {
			url,
			title: meta?.title ?? null,
			description: meta?.description ?? null,
			statusCode: meta?.statusCode ?? null,
			content:
				markdown.length > MAX_CONTENT_CHARS
					? `${markdown.slice(0, MAX_CONTENT_CHARS)}\n…[truncated]`
					: markdown,
			internalLinks,
		};

		setCache(key, JSON.stringify(result));

		return result;
	} catch (err) {
		return {
			error: `Scrape failed: ${(err as Error).message?.slice(0, 200)}`,
		};
	}
}

export async function getCachedSiteContext(
	domain: string
): Promise<string | null> {
	const key = cacheKey(domain, "/");
	const cached = await getCached(key);
	if (!cached) {
		return null;
	}
	try {
		const data = JSON.parse(cached) as ScrapeResult;
		const parts = [`Site: ${domain}`];
		if (data.title) {
			parts.push(`Title: ${data.title}`);
		}
		if (data.description) {
			parts.push(`Description: ${data.description}`);
		}
		if (data.content) {
			const truncated =
				data.content.length > 2000
					? `${data.content.slice(0, 2000)}...`
					: data.content;
			parts.push(`Content:\n${truncated}`);
		}
		return parts.join("\n");
	} catch {
		return null;
	}
}

export function createScrapeTools() {
	const scrapeTool = tool({
		description:
			'Scrape a page from one of the workspace websites and return its content as markdown plus internal links. Use to understand the product: what the site does, key pages, pricing, CTAs. Also use when investigating page-level anomalies. Scrape "/" first for product context, then specific pages as needed. Pass websiteId to target a specific site; omit to use the workspace default. Results are cached for 24h.',
		inputSchema: z.object({
			websiteId: z
				.string()
				.optional()
				.describe(
					"Target website id. Omit to use the workspace default. Get ids from list_websites."
				),
			path: z
				.string()
				.describe(
					"Page path to scrape (e.g. '/', '/pricing', '/docs'). Must be a path on the target website."
				),
		}),
		execute: async ({ websiteId, path }, options) => {
			const ctx = getAppContext(options);
			const resolved = resolveToolWebsite(ctx, websiteId);
			const domain =
				resolved.domain || (await getWebsiteDomain(resolved.websiteId));
			if (!domain) {
				return { error: "Could not resolve a domain for the target website" };
			}
			return scrapePage(domain, path);
		},
	});

	return { scrape_page: scrapeTool };
}
