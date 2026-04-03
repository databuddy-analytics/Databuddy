import { createHash } from "node:crypto";
import { db, eq, links } from "@databuddy/db";
import {
	type CachedLink,
	getCachedLink,
	getRateLimitHeaders,
	rateLimit,
	setCachedLink,
	setCachedLinkNotFound,
	shouldRecordClick,
} from "@databuddy/redis";
import { Elysia, redirect, t } from "elysia";
import { LRUCache } from "lru-cache";
import { sendLinkVisit } from "../lib/producer";
import { captureError, mergeWideEvent, setAttributes } from "../lib/tracing";
import { isBot, isSocialBot } from "../utils/bot-detection";
import { getTargetUrl } from "../utils/device-targeting";
import { extractIp, getGeo } from "../utils/geo";
import { hashIp } from "../utils/hash";
import { parseUserAgent } from "../utils/user-agent";

const EXPIRED_URL = "https://app.databuddy.cc/dby/expired";
const NOT_FOUND_URL = "https://app.databuddy.cc/dby/not-found";
const PROXY_URL = "https://app.databuddy.cc/dby/l";

/** Set to `true` to enforce per-IP Redis rate limits (100 req / 60s). */
const RATE_LIMIT_ENABLED = false;

function defaultRateLimit() {
	return {
		success: true,
		limit: 100,
		remaining: 99,
		reset: Date.now() + 60_000,
	};
}

const NULL_SENTINEL = Object.freeze({ __null: true }) as unknown as CachedLink;

const linkMemCache = new LRUCache<string, CachedLink>({
	max: 1000,
	ttl: 5000,
});
const etagMemCache = new LRUCache<string, string>({
	max: 1000,
	ttl: 60_000,
});
const dedupMemCache = new LRUCache<string, true>({
	max: 10_000,
	ttl: 300_000,
});

function generateETag(link: CachedLink, targetUrl: string): string {
	const cacheKey = `${link.id}:${targetUrl}:${link.expiresAt ?? ""}`;
	const cached = etagMemCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const hash = createHash("md5").update(cacheKey).digest("hex").slice(0, 16);
	const etag = `"${hash}"`;
	etagMemCache.set(cacheKey, etag);
	return etag;
}

interface LinkLookupResult {
	cacheHit: boolean;
	cacheMs: number;
	dbMs: number;
	link: CachedLink | null;
}

async function getLinkBySlug(slug: string): Promise<LinkLookupResult> {
	const memHit = linkMemCache.get(slug);
	if (memHit !== undefined) {
		const link = memHit === NULL_SENTINEL ? null : memHit;
		return { link, cacheHit: true, cacheMs: 0, dbMs: 0 };
	}

	const tCache = performance.now();
	const cached = await getCachedLink(slug).catch((err) => {
		captureError(err, { error_step: "cache_get" });
		return null;
	});
	const cacheMs = Math.round(performance.now() - tCache);

	if (cached) {
		linkMemCache.set(slug, cached);
		return { link: cached, cacheHit: true, cacheMs, dbMs: 0 };
	}

	const tDb = performance.now();
	const dbLink = await db.query.links.findFirst({
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
	const dbMs = Math.round(performance.now() - tDb);

	if (!dbLink) {
		linkMemCache.set(slug, NULL_SENTINEL);
		await setCachedLinkNotFound(slug).catch((err) => {
			captureError(err, { error_step: "cache_set_not_found" });
		});
		return { link: null, cacheHit: false, cacheMs, dbMs };
	}

	const link: CachedLink = {
		id: dbLink.id,
		targetUrl: dbLink.targetUrl,
		expiresAt: dbLink.expiresAt?.toISOString() ?? null,
		expiredRedirectUrl: dbLink.expiredRedirectUrl,
		ogTitle: dbLink.ogTitle,
		ogDescription: dbLink.ogDescription,
		ogImageUrl: dbLink.ogImageUrl,
		ogVideoUrl: dbLink.ogVideoUrl,
		iosUrl: dbLink.iosUrl,
		androidUrl: dbLink.androidUrl,
	};

	linkMemCache.set(slug, link);
	await setCachedLink(slug, link).catch((err) => {
		captureError(err, { error_step: "cache_backfill" });
	});

	return { link, cacheHit: false, cacheMs, dbMs };
}

function appendRefParam(targetUrl: string, linkId: string): string {
	try {
		const url = new URL(targetUrl);
		url.searchParams.set("ref", linkId);
		return url.toString();
	} catch {
		return targetUrl;
	}
}

async function recordClick(
	link: CachedLink,
	ipHash: string,
	ip: string,
	request: Request
): Promise<void> {
	const t0 = performance.now();
	const dedupKey = `${link.id}:${ipHash}`;

	if (dedupMemCache.has(dedupKey)) {
		setAttributes({
			click_recorded: false,
			click_reason: "mem_deduplicated",
			click_pipeline_ms: Math.round(performance.now() - t0),
		});
		return;
	}

	const shouldRecord = await shouldRecordClick(link.id, ipHash).catch((err) => {
		captureError(err, { error_step: "dedup_check" });
		return true;
	});

	if (!shouldRecord) {
		dedupMemCache.set(dedupKey, true);
		setAttributes({
			click_recorded: false,
			click_reason: "deduplicated",
			click_pipeline_ms: Math.round(performance.now() - t0),
		});
		return;
	}

	const userAgent = request.headers.get("user-agent");
	const ua = parseUserAgent(userAgent);
	const geo = await getGeo(ip, request);

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
			browser_name: ua.browserName,
			device_type: ua.deviceType,
		},
		link.id
	);

	setAttributes({
		click_recorded: true,
		click_pipeline_ms: Math.round(performance.now() - t0),
	});
}

export const redirectRoute = new Elysia().get(
	"/:slug",
	async function handleRedirect({ params, request, set }) {
		const t0 = performance.now();
		const { slug } = params;
		const ip = extractIp(request);
		const ipHash = hashIp(ip);

		const event: Record<string, string | number | boolean> = {
			link_slug: slug,
		};

		function emit(result: string) {
			event.redirect_result = result;
			event.latency_total_ms = Math.round(performance.now() - t0);
			mergeWideEvent(event);
		}

		const tRl = performance.now();
		const rl = RATE_LIMIT_ENABLED
			? await rateLimit(`redirect:${ipHash}`, 100, 60).catch((err) => {
					captureError(err, { error_step: "rate_limit" });
					return defaultRateLimit();
				})
			: defaultRateLimit();
		event.latency_rate_limit_ms = Math.round(performance.now() - tRl);
		event.rate_limit_remaining = rl.remaining;
		const headers = getRateLimitHeaders(rl);

		if (!rl.success) {
			emit("rate_limited");
			set.status = 429;
			set.headers = { ...headers, "Content-Type": "application/json" };
			return { error: "Too many requests" };
		}

		const { link, cacheHit, cacheMs, dbMs } = await getLinkBySlug(slug);
		event.cache_hit = cacheHit;
		event.latency_cache_ms = cacheMs;
		event.latency_db_ms = dbMs;

		if (!link) {
			emit("not_found");
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(NOT_FOUND_URL, 302);
		}

		event.link_id = link.id;

		if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
			emit("expired");
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(link.expiredRedirectUrl ?? EXPIRED_URL, 302);
		}

		const userAgent = request.headers.get("user-agent");
		const targetUrl = getTargetUrl(link, userAgent);

		if (isSocialBot(userAgent)) {
			emit("og_preview");
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(`${PROXY_URL}/${slug}`, 302);
		}

		if (isBot(userAgent)) {
			emit("bot");
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(targetUrl, 302);
		}

		const attributedUrl = appendRefParam(targetUrl, link.id);
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
