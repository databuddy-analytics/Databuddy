import { and, db, eq, isNull } from "@databuddy/db";
import { config } from "@databuddy/env/app";
import {
	type CachedLink,
	getCachedLink,
	getRateLimitHeaders,
	ratelimit,
	setCachedLinkIfAbsent,
	setCachedLinkNotFoundIfAbsent,
} from "@databuddy/redis";
import { links } from "@databuddy/db/schema";
import { BotCategory, detectBot } from "@databuddy/shared/bot-detection";
import { resolveDeepLink } from "@databuddy/shared/constants/deep-link-apps";
import {
	isHttpUrl,
	PUBLIC_LINK_SLUG_REGEX,
} from "@databuddy/shared/constants/links";
import { Elysia, redirect, t } from "elysia";
import { LRUCache } from "lru-cache";
import { createHash, randomUUID } from "node:crypto";
import { UAParser } from "ua-parser-js";
import { captureError, mergeWideEvent, record } from "../lib/logging";
import { createDeepLinkFallbackResponse } from "../lib/deep-link-fallback";
import { sendLinkVisit, type LinkVisitEvent } from "../lib/producer";
import { extractIp, getGeo } from "../utils/geo";

const EXPIRED_URL = `${config.urls.dashboard}/dby/expired`;
const NOT_FOUND_URL = `${config.urls.dashboard}/dby/not-found`;
const OG_PROXY_URL = `${config.urls.dashboard}/dby/l`;

const etagCache = new LRUCache<string, string>({ max: 1000, ttl: 60_000 });
const botCache = new LRUCache<string, { isBot: boolean; isSocial: boolean }>({
	max: 500,
	ttl: 300_000,
});
const uaCache = new LRUCache<
	string,
	{ browser: string | null; device: string | null }
>({ max: 500, ttl: 300_000 });

function ms(since: number): number {
	return Math.round(performance.now() - since);
}

let dailySalt = new Date().toISOString().slice(0, 10);
let saltUpdatedAt = Date.now();

function hashIp(ip: string): string {
	const now = Date.now();
	if (now - saltUpdatedAt > 60_000) {
		dailySalt = new Date().toISOString().slice(0, 10);
		saltUpdatedAt = now;
	}
	return createHash("sha256")
		.update(ip + dailySalt)
		.digest("hex");
}

function checkBot(ua: string | null): { isBot: boolean; isSocial: boolean } {
	if (!ua) {
		return { isBot: false, isSocial: false };
	}
	const cached = botCache.get(ua);
	if (cached) {
		return cached;
	}

	const result = detectBot(ua);
	const entry = {
		isBot: result.isBot,
		isSocial:
			result.category === BotCategory.SOCIAL_MEDIA ||
			result.category === BotCategory.SEARCH_ENGINE,
	};
	botCache.set(ua, entry);
	return entry;
}

function parseUA(ua: string | null): {
	browser: string | null;
	device: string | null;
} {
	if (!ua) {
		return { browser: null, device: null };
	}
	const cached = uaCache.get(ua);
	if (cached) {
		return cached;
	}

	try {
		const r = new UAParser(ua).getResult();
		const parsed = {
			browser: r.browser.name || null,
			device: r.device.type || "desktop",
		};
		uaCache.set(ua, parsed);
		return parsed;
	} catch {
		return { browser: null, device: null };
	}
}

function getTargetUrl(link: CachedLink, ua: string | null): string {
	if (ua) {
		const lower = ua.toLowerCase();
		if (
			link.iosUrl &&
			isHttpUrl(link.iosUrl) &&
			(lower.includes("iphone") ||
				lower.includes("ipad") ||
				lower.includes("ipod"))
		) {
			return link.iosUrl;
		}
		if (
			link.androidUrl &&
			isHttpUrl(link.androidUrl) &&
			lower.includes("android")
		) {
			return link.androidUrl;
		}
	}
	return isHttpUrl(link.targetUrl) ? link.targetUrl : NOT_FOUND_URL;
}

function isMobile(ua: string | null): boolean {
	if (!ua) {
		return false;
	}
	const lower = ua.toLowerCase();
	return (
		lower.includes("iphone") ||
		lower.includes("ipad") ||
		lower.includes("ipod") ||
		lower.includes("android")
	);
}

function generateETag(link: CachedLink, targetUrl: string): string {
	const key = `${link.id}:${targetUrl}:${link.expiresAt ?? ""}`;
	const cached = etagCache.get(key);
	if (cached) {
		return cached;
	}

	const etag = `"${createHash("md5").update(key).digest("hex").slice(0, 16)}"`;
	etagCache.set(key, etag);
	return etag;
}

async function lookupLink(slug: string, ipHash: string) {
	const t0 = performance.now();
	const cached = await record("link.cache.get", () =>
		getCachedLink(slug).catch((err) => {
			captureError(err, { error_step: "cache_get" });
			return { state: "miss" as const };
		})
	);
	const redis_ms = ms(t0);

	if (cached.state === "hit") {
		return {
			link: cached.link,
			cacheHit: true,
			lookup_source: "redis",
			rateLimitHeaders: null,
			redis_ms,
			db_ms: 0,
		};
	}
	if (cached.state === "not_found") {
		return {
			link: null,
			cacheHit: true,
			lookup_source: "redis_not_found",
			rateLimitHeaders: null,
			redis_ms,
			db_ms: 0,
		};
	}
	if (cached.state === "pending") {
		return {
			link: null,
			cacheHit: true,
			lookup_source: "redis_pending",
			rateLimitHeaders: null,
			redis_ms,
			db_ms: 0,
		};
	}

	const limit = await record("link.cache_miss.rate_limit", () =>
		ratelimit(`link-cache-miss:${ipHash}`, 60, 60)
	);
	if (!limit.success) {
		return {
			link: null,
			cacheHit: false,
			lookup_source: "rate_limited",
			rateLimitHeaders: getRateLimitHeaders(limit),
			redis_ms,
			db_ms: 0,
		};
	}

	const t1 = performance.now();
	const row = await record("link.db.find", async () => {
		const rows = await db
			.select({
				id: links.id,
				targetUrl: links.targetUrl,
				expiresAt: links.expiresAt,
				expiredRedirectUrl: links.expiredRedirectUrl,
				ogTitle: links.ogTitle,
				ogDescription: links.ogDescription,
				ogImageUrl: links.ogImageUrl,
				ogVideoUrl: links.ogVideoUrl,
				iosUrl: links.iosUrl,
				androidUrl: links.androidUrl,
				deepLinkApp: links.deepLinkApp,
			})
			.from(links)
			.where(and(eq(links.slug, slug), isNull(links.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	});
	const db_ms = ms(t1);

	if (!row) {
		await record("link.cache.set_not_found", () =>
			setCachedLinkNotFoundIfAbsent(slug).catch((err) =>
				captureError(err, { error_step: "cache_set_not_found" })
			)
		);
		return {
			link: null,
			cacheHit: false,
			lookup_source: "db_miss",
			rateLimitHeaders: null,
			redis_ms,
			db_ms,
		};
	}

	const link: CachedLink = {
		id: row.id,
		targetUrl: row.targetUrl,
		expiresAt: row.expiresAt?.toISOString() ?? null,
		expiredRedirectUrl: row.expiredRedirectUrl,
		ogTitle: row.ogTitle,
		ogDescription: row.ogDescription,
		ogImageUrl: row.ogImageUrl,
		ogVideoUrl: row.ogVideoUrl,
		iosUrl: row.iosUrl,
		androidUrl: row.androidUrl,
		deepLinkApp: row.deepLinkApp,
	};

	await record("link.cache.set", () =>
		setCachedLinkIfAbsent(slug, link).catch((err) =>
			captureError(err, { error_step: "cache_backfill" })
		)
	);
	return {
		link,
		cacheHit: false,
		lookup_source: "db",
		rateLimitHeaders: null,
		redis_ms,
		db_ms,
	};
}

async function recordClick(
	link: CachedLink,
	ipHash: string,
	ip: string,
	request: Request
): Promise<void> {
	const t0 = performance.now();

	const userAgent = request.headers.get("user-agent");
	const ua = parseUA(userAgent);

	const tGeo = performance.now();
	const geo = await record("link.click.geo", () => getGeo(ip, request)).catch(
		(error) => {
			captureError(error, { error_step: "click_geo" });
			return { city: null, country: null, region: null };
		}
	);
	const geo_ms = ms(tGeo);

	const event: LinkVisitEvent = {
		browser_name: ua.browser,
		city: geo.city,
		country: geo.country,
		device_type: ua.device,
		id: randomUUID(),
		ip_hash: ipHash,
		link_id: link.id,
		referrer: request.headers.get("referer"),
		region: geo.region,
		timestamp: new Date().toISOString().replace("T", " ").replace("Z", ""),
		user_agent: userAgent,
	};
	const tDelivery = performance.now();
	const acknowledged = await record("link.click.kafka", () =>
		sendLinkVisit(event, link.id)
	);
	const delivery_ms = ms(tDelivery);

	// Kafka's full acknowledgement is the only success boundary. A timeout or
	// disconnect is intentionally treated as ambiguous: returning a 503 lets
	// the caller retry instead of claiming a click that might be lost.
	if (!acknowledged) {
		throw new Error("Link visit was not acknowledged by Redpanda");
	}

	mergeWideEvent({
		click_recorded: true,
		click_reason: "kafka_acknowledged",
		...(ua.browser ? { click_browser: ua.browser } : {}),
		...(ua.device ? { click_device: ua.device } : {}),
		...(geo.country ? { click_country: geo.country } : {}),
		"timing.click.geo": geo_ms,
		"timing.click.delivery": delivery_ms,
		"timing.click": ms(t0),
	});
}

const IGNORED_SLUGS = new Set([
	"robots.txt",
	"favicon.ico",
	"sitemap.xml",
	".well-known",
]);
function retryResponse(error: string, retryAfter: string): Response {
	// policy-ignore http/no-custom-json-error-response: These edge retry paths must preserve Retry-After when a cache mutation or click admission is unavailable.
	return Response.json(
		{ error },
		{
			status: 503,
			headers: {
				"Cache-Control": "private, no-store",
				"Retry-After": retryAfter,
			},
		}
	);
}

export const redirectRoute = new Elysia().get(
	"/:slug",
	async function handleRedirect({ params, request, set }) {
		const t0 = performance.now();
		const { slug } = params;

		if (IGNORED_SLUGS.has(slug)) {
			set.status = 404;
			return;
		}
		if (!PUBLIC_LINK_SLUG_REGEX.test(slug)) {
			set.headers = { "Cache-Control": "private, no-store" };
			return redirect(NOT_FOUND_URL, 302);
		}
		const ip = extractIp(request);
		const ipHash = hashIp(ip);
		const ev: Record<string, string | number | boolean> = { link_slug: slug };

		function emit(result: string) {
			ev.redirect_result = result;
			ev.total_ms = ms(t0);
			ev["timing.redirect.total"] = ev.total_ms;
			mergeWideEvent(ev);
		}

		const tLookup = performance.now();
		const { link, cacheHit, lookup_source, rateLimitHeaders, redis_ms, db_ms } =
			await record("redirect.lookup", () => lookupLink(slug, ipHash));
		ev.lookup_ms = ms(tLookup);
		ev.lookup_source = lookup_source;
		ev.cache_hit = cacheHit;
		ev.redis_ms = redis_ms;
		ev.db_ms = db_ms;

		if (rateLimitHeaders) {
			emit("rate_limited");
			// policy-ignore http/no-custom-json-error-response: The cache-miss limiter returns per-request rate-limit headers that this edge route must preserve.
			return Response.json(
				{ error: "Too many uncached links requested" },
				{
					status: 429,
					headers: {
						"Cache-Control": "private, no-store",
						...rateLimitHeaders,
					},
				}
			);
		}

		if (lookup_source === "redis_pending") {
			emit("mutation_pending");
			return retryResponse("This link is being updated. Please retry.", "1");
		}

		if (!link) {
			emit("not_found");
			set.headers = { "Cache-Control": "private, no-store" };
			return redirect(NOT_FOUND_URL, 302);
		}

		ev.link_id = link.id;

		if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
			emit("expired");
			set.headers = { "Cache-Control": "private, no-store" };
			return redirect(
				link.expiredRedirectUrl && isHttpUrl(link.expiredRedirectUrl)
					? link.expiredRedirectUrl
					: EXPIRED_URL,
				302
			);
		}

		const userAgent = request.headers.get("user-agent");
		const targetUrl = getTargetUrl(link, userAgent);
		const bot = checkBot(userAgent);
		ev.is_bot = bot.isBot;
		ev.is_social_bot = bot.isSocial;

		if (bot.isSocial) {
			emit("og_preview");
			set.headers = { "Cache-Control": "private, no-store" };
			return redirect(`${OG_PROXY_URL}/${slug}`, 302);
		}
		if (bot.isBot) {
			emit("bot");
			set.headers = { "Cache-Control": "private, no-store" };
			return redirect(targetUrl, 302);
		}

		const deepUri =
			link.deepLinkApp && isMobile(userAgent)
				? resolveDeepLink(link.deepLinkApp, link.targetUrl)
				: null;
		let response: Response;
		let result: "deep_link" | "success";
		let etag: string | undefined;

		if (deepUri) {
			result = "deep_link";
			response = createDeepLinkFallbackResponse(deepUri, targetUrl);
		} else {
			etag = generateETag(link, targetUrl);
			if (request.headers.get("if-none-match") === etag) {
				emit("not_modified");
				set.status = 304;
				set.headers = {
					"Cache-Control": "private, no-cache",
					ETag: etag,
				};
				return;
			}
			result = "success";
			response = redirect(targetUrl, 302);
		}

		try {
			await recordClick(link, ipHash, ip, request);
		} catch (error) {
			captureError(error, {
				error_step: "click_admission",
				link_id: link.id,
			});
			emit("analytics_unavailable");
			return retryResponse(
				"Click tracking is temporarily unavailable. Please retry.",
				"5"
			);
		}

		emit(result);
		if (etag) {
			set.headers = {
				"Cache-Control": "private, no-cache",
				ETag: etag,
			};
		}
		return response;
	},
	{ params: t.Object({ slug: t.String() }) }
);
