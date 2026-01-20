import { and, db, eq, isNull, links } from "@databuddy/db";
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
import { sendLinkVisit } from "../lib/producer";
import { captureError, record, setAttributes } from "../lib/tracing";
import { isBot, isSocialBot } from "../utils/bot-detection";
import { getTargetUrl } from "../utils/device-targeting";
import { extractIp, getGeo } from "../utils/geo";
import { hashIp } from "../utils/hash";
import { generateOgHtml } from "../utils/og-html";
import { parseUserAgent } from "../utils/user-agent";

const EXPIRED_URL = "https://dby.sh/expired";
const NOT_FOUND_URL = "https://dby.sh/not-found";
const RATE_LIMIT = { requests: 100, windowSeconds: 60 };

function lookupLinkFromCache(
	slug: string
): Promise<{ link: CachedLink | null; cache_hit: boolean }> {
	return record("links-cache_lookup", async () => {
		setAttributes({ link_slug: slug });

		const cached = await getCachedLink(slug).catch(() => null);
		if (cached) {
			setAttributes({ link_cache_hit: true, link_id: cached.id });
			return { link: cached, cache_hit: true };
		}

		setAttributes({ link_cache_hit: false });
		return { link: null, cache_hit: false };
	});
}

function lookupLinkFromDatabase(slug: string): Promise<CachedLink | null> {
	return record("links-db_lookup", async () => {
		setAttributes({ link_slug: slug });

		const dbLink = await db.query.links.findFirst({
			where: and(eq(links.slug, slug), isNull(links.deletedAt)),
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

		if (!dbLink) {
			setAttributes({ link_found: false });
			await setCachedLinkNotFound(slug).catch(() => { });
			return null;
		}

		setAttributes({ link_found: true, link_id: dbLink.id });

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

		await setCachedLink(slug, link).catch(() => { });
		return link;
	});
}

async function getLinkBySlug(
	slug: string
): Promise<{ link: CachedLink | null; cache_hit: boolean }> {
	const cacheResult = await lookupLinkFromCache(slug);
	if (cacheResult.link) {
		return cacheResult;
	}

	const dbLink = await lookupLinkFromDatabase(slug);
	return { link: dbLink, cache_hit: false };
}

function isExpired(link: CachedLink): boolean {
	return link.expiresAt ? new Date(link.expiresAt) < new Date() : false;
}

function checkRateLimit(
	ipHash: string
): Promise<{ success: boolean; headers: Record<string, string> }> {
	return record("links-rate_limit", async () => {
		setAttributes({ ip_hash: ipHash.slice(0, 8) });

		const rl = await rateLimit(
			`redirect:${ipHash}`,
			RATE_LIMIT.requests,
			RATE_LIMIT.windowSeconds
		);
		const headers = getRateLimitHeaders(rl);

		setAttributes({
			rate_limit_success: rl.success,
			rate_limit_remaining: rl.remaining,
		});

		return { success: rl.success, headers };
	});
}

function recordClick(
	link: CachedLink,
	ipHash: string,
	ip: string,
	request: Request
): Promise<void> {
	return record("links-record_click", async () => {
		setAttributes({ link_id: link.id });

		const shouldRecord = await shouldRecordClick(link.id, ipHash);
		setAttributes({ click_should_record: shouldRecord });

		if (!shouldRecord) {
			return;
		}

		const userAgent = request.headers.get("user-agent");
		const [geo, ua] = await Promise.all([
			record("links-geo_lookup", async () => {
				const result = await getGeo(ip);
				setAttributes({
					geo_country: result.country,
					geo_region: result.region,
					geo_city: result.city,
				});
				return result;
			}),
			Promise.resolve(parseUserAgent(userAgent)),
		]);

		setAttributes({
			click_browser: ua.browserName,
			click_device_type: ua.deviceType,
		});

		await record("links-kafka_send", () =>
			sendLinkVisit(
				{
					link_id: link.id,
					timestamp: new Date()
						.toISOString()
						.replace("T", " ")
						.replace("Z", ""),
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
			)
		);

		setAttributes({ click_recorded: true });
	});
}

export const redirectRoute = new Elysia().get(
	"/:slug",
	async function handleRedirect({ params, request, set }) {
		const slug = params.slug;

		setAttributes({
			link_slug: slug,
			request_url: request.url,
		});

		const ip = extractIp(request);
		const ipHash = hashIp(ip);

		const { success: rateLimitOk, headers } = await checkRateLimit(ipHash);

		if (!rateLimitOk) {
			setAttributes({ redirect_result: "rate_limited" });
			set.status = 429;
			set.headers = { ...headers, "Content-Type": "application/json" };
			return { error: "Too many requests" };
		}

		const { link, cache_hit } = await getLinkBySlug(slug);

		setAttributes({
			link_cache_hit: cache_hit,
			link_found: Boolean(link),
		});

		if (!link) {
			setAttributes({ redirect_result: "not_found" });
			set.headers = headers;
			return redirect(NOT_FOUND_URL, 302);
		}

		setAttributes({ link_id: link.id });

		const expired = isExpired(link);
		setAttributes({ link_expired: expired });

		if (expired) {
			setAttributes({ redirect_result: "expired" });
			set.headers = headers;
			return redirect(link.expiredRedirectUrl ?? EXPIRED_URL, 302);
		}

		const userAgent = request.headers.get("user-agent");
		const targetUrl = getTargetUrl(link, userAgent);

		setAttributes({ link_target_url: targetUrl });

		const socialBot = isSocialBot(userAgent);
		const bot = isBot(userAgent);

		setAttributes({
			request_is_bot: bot,
			request_is_social_bot: socialBot,
		});

		const hasOg =
			link.ogTitle ?? link.ogDescription ?? link.ogImageUrl ?? link.ogVideoUrl;
		if (hasOg && socialBot) {
			setAttributes({ redirect_result: "og_preview" });
			set.headers = { ...headers, "Content-Type": "text/html; charset=utf-8" };
			return new Response(generateOgHtml(link, request.url, targetUrl), {
				status: 200,
			});
		}

		if (bot) {
			setAttributes({ redirect_result: "bot_redirect" });
			set.headers = headers;
			return redirect(targetUrl, 302);
		}

		recordClick(link, ipHash, ip, request).catch((err) =>
			captureError(err, { link_id: link.id, operation: "record_click" })
		);

		setAttributes({ redirect_result: "success" });
		set.headers = headers;
		return redirect(targetUrl, 302);
	},
	{ params: t.Object({ slug: t.String() }) }
);
