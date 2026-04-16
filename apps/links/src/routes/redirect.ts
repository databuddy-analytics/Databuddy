import { createHash } from "node:crypto";
import { db, eq } from "@databuddy/db";
import { links } from "@databuddy/db/schema";
import {
	type CachedLink,
	getCachedLink,
	getRateLimitHeaders,
	rateLimit,
	setCachedLink,
	setCachedLinkNotFound,
	shouldRecordClick,
} from "@databuddy/redis";
import { BotCategory, detectBot } from "@databuddy/shared/bot-detection";
import { Elysia, redirect, t } from "elysia";
import { LRUCache } from "lru-cache";
import { UAParser } from "ua-parser-js";
import { captureError, mergeWideEvent, setAttributes } from "../lib/logging";
import { sendLinkVisit } from "../lib/producer";
import { extractIp, getGeo } from "../utils/geo";

const EXPIRED_URL = "https://app.databuddy.cc/dby/expired";
const NOT_FOUND_URL = "https://app.databuddy.cc/dby/not-found";
const OG_PROXY_URL = "https://app.databuddy.cc/dby/l";

const NULL_SENTINEL = Object.freeze({ __null: true }) as unknown as CachedLink;
const linkCache = new LRUCache<string, CachedLink>({ max: 1000, ttl: 5000 });
const etagCache = new LRUCache<string, string>({ max: 1000, ttl: 60_000 });
const dedupCache = new LRUCache<string, true>({ max: 10_000, ttl: 300_000 });
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
			(lower.includes("iphone") ||
				lower.includes("ipad") ||
				lower.includes("ipod"))
		) {
			return link.iosUrl;
		}
		if (link.androidUrl && lower.includes("android")) {
			return link.androidUrl;
		}
	}
	return link.targetUrl;
}

function appendRef(url: string, linkId: string): string {
	return `${url}${url.includes("?") ? "&" : "?"}ref=${encodeURIComponent(linkId)}`;
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

async function lookupLink(slug: string) {
	const memHit = linkCache.get(slug);
	if (memHit !== undefined) {
		return {
			link: memHit === NULL_SENTINEL ? null : memHit,
			cacheHit: true,
			lookup_source: "mem",
			redis_ms: 0,
			db_ms: 0,
		};
	}

	const t0 = performance.now();
	const cached = await getCachedLink(slug).catch((err) => {
		captureError(err, { error_step: "cache_get" });
		return null;
	});
	const redis_ms = ms(t0);

	if (cached) {
		linkCache.set(slug, cached);
		return {
			link: cached,
			cacheHit: true,
			lookup_source: "redis",
			redis_ms,
			db_ms: 0,
		};
	}

	const t1 = performance.now();
	const row = await db.query.links.findFirst({
		where: eq(links.slug, slug),
		columns: {
			id: true,
			targetUrl: true,
			expiresAt: true,
			expiredRedirectUrl: true,
			ogTitle: true,
			ogDescription: true,
			ogImageUrl: true,
			ogVideoUrl: true,
			iosUrl: true,
			androidUrl: true,
		},
	});
	const db_ms = ms(t1);

	if (!row) {
		linkCache.set(slug, NULL_SENTINEL);
		await setCachedLinkNotFound(slug).catch((err) =>
			captureError(err, { error_step: "cache_set_not_found" })
		);
		return {
			link: null,
			cacheHit: false,
			lookup_source: "db_miss",
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
	};

	linkCache.set(slug, link);
	await setCachedLink(slug, link).catch((err) =>
		captureError(err, { error_step: "cache_backfill" })
	);
	return { link, cacheHit: false, lookup_source: "db", redis_ms, db_ms };
}

async function recordClick(
	link: CachedLink,
	ipHash: string,
	ip: string,
	request: Request
): Promise<void> {
	const t0 = performance.now();
	const dedupKey = `${link.id}:${ipHash}`;

	if (dedupCache.has(dedupKey)) {
		setAttributes({
			click_recorded: false,
			click_reason: "mem_deduplicated",
			click_ms: ms(t0),
		});
		return;
	}

	const t1 = performance.now();
	const shouldRecord = await shouldRecordClick(link.id, ipHash).catch((err) => {
		captureError(err, { error_step: "dedup_check" });
		return true;
	});
	const dedup_ms = ms(t1);

	if (!shouldRecord) {
		dedupCache.set(dedupKey, true);
		setAttributes({
			click_recorded: false,
			click_reason: "deduplicated",
			dedup_ms,
			click_ms: ms(t0),
		});
		return;
	}

	const userAgent = request.headers.get("user-agent");
	const ua = parseUA(userAgent);

	const t2 = performance.now();
	const geo = await getGeo(ip, request);
	const geo_ms = ms(t2);

	const t3 = performance.now();
	await sendLinkVisit(
		{
			link_id: link.id,
			timestamp: new Date().toISOString().replace("T", " ").replace("Z", ""),
			referrer: request.headers.get("referer"),
			user_agent: userAgent,
			ip_hash: ipHash,
			country: geo.country,
			region: geo.region,
			city: geo.city,
			browser_name: ua.browser,
			device_type: ua.device,
		},
		link.id
	);
	const kafka_ms = ms(t3);

	setAttributes({
		click_recorded: true,
		dedup_ms,
		geo_ms,
		kafka_ms,
		click_ms: ms(t0),
	});
}

const DEFAULT_RL = {
	success: true,
	limit: 100,
	remaining: 99,
	reset: Date.now() + 60_000,
};

export const redirectRoute = new Elysia().get(
	"/:slug",
	async function handleRedirect({ params, request, set }) {
		const t0 = performance.now();
		const { slug } = params;
		const ip = extractIp(request);
		const ipHash = hashIp(ip);
		const ev: Record<string, string | number | boolean> = { link_slug: slug };

		function emit(result: string) {
			ev.redirect_result = result;
			ev.total_ms = ms(t0);
			mergeWideEvent(ev);
		}

		const tRl = performance.now();
		const rl = await rateLimit(`redirect:${ipHash}`, 100, 60).catch((err) => {
			captureError(err, { error_step: "rate_limit" });
			return DEFAULT_RL;
		});
		ev.rate_limit_ms = ms(tRl);
		ev.rate_limit_remaining = rl.remaining;
		const headers = getRateLimitHeaders(rl);

		if (!rl.success) {
			emit("rate_limited");
			set.status = 429;
			set.headers = { ...headers, "Content-Type": "application/json" };
			return { error: "Too many requests" };
		}

		const tLookup = performance.now();
		const { link, cacheHit, lookup_source, redis_ms, db_ms } =
			await lookupLink(slug);
		ev.lookup_ms = ms(tLookup);
		ev.lookup_source = lookup_source;
		ev.cache_hit = cacheHit;
		ev.redis_ms = redis_ms;
		ev.db_ms = db_ms;

		if (!link) {
			emit("not_found");
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(NOT_FOUND_URL, 302);
		}

		ev.link_id = link.id;

		if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
			emit("expired");
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(link.expiredRedirectUrl ?? EXPIRED_URL, 302);
		}

		const userAgent = request.headers.get("user-agent");
		const targetUrl = getTargetUrl(link, userAgent);
		const bot = checkBot(userAgent);

		if (bot.isSocial) {
			emit("og_preview");
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(`${OG_PROXY_URL}/${slug}`, 302);
		}
		if (bot.isBot) {
			emit("bot");
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(targetUrl, 302);
		}

		const attributedUrl = appendRef(targetUrl, link.id);
		const etag = generateETag(link, attributedUrl);

		if (request.headers.get("if-none-match") === etag) {
			emit("not_modified");
			set.status = 304;
			set.headers = {
				...headers,
				"Cache-Control": "private, no-cache",
				ETag: etag,
			};
			return;
		}

		recordClick(link, ipHash, ip, request).catch((err) =>
			captureError(err, { error_step: "record_click", link_id: link.id })
		);

		emit("success");
		set.headers = {
			...headers,
			"Cache-Control": "private, no-cache",
			ETag: etag,
		};
		return redirect(attributedUrl, 302);
	},
	{ params: t.Object({ slug: t.String() }) }
);
