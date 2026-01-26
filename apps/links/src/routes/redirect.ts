import { createHash } from "node:crypto";
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
import { captureError, setAttributes } from "../lib/tracing";
import { isBot, isSocialBot } from "../utils/bot-detection";
import { getTargetUrl } from "../utils/device-targeting";
import { extractIp, getGeo } from "../utils/geo";
import { hashIp } from "../utils/hash";
import { parseUserAgent } from "../utils/user-agent";

const EXPIRED_URL = "https://app.databuddy.cc/dby/expired";
const NOT_FOUND_URL = "https://app.databuddy.cc/dby/not-found";
const PROXY_URL = "https://app.databuddy.cc/dby/l";

function generateETag(link: CachedLink, targetUrl: string): string {
	const hash = createHash("md5")
		.update(`${link.id}:${targetUrl}:${link.expiresAt ?? ""}`)
		.digest("hex")
		.slice(0, 16);
	return `"${hash}"`;
}

async function getLinkBySlug(slug: string): Promise<CachedLink | null> {
	const cached = await getCachedLink(slug).catch(() => null);
	if (cached) {
		setAttributes({ link_cache_hit: true });
		return cached;
	}

	setAttributes({ link_cache_hit: false });

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
		await setCachedLinkNotFound(slug).catch(() => { });
		return null;
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

	await setCachedLink(slug, link).catch(() => { });
	return link;
}

async function recordClick(
	link: CachedLink,
	ipHash: string,
	ip: string,
	request: Request
): Promise<void> {
	const shouldRecord = await shouldRecordClick(link.id, ipHash);
	if (!shouldRecord) {
		return;
	}

	const userAgent = request.headers.get("user-agent");
	const [geo, ua] = await Promise.all([
		getGeo(ip),
		Promise.resolve(parseUserAgent(userAgent)),
	]);

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
}

export const redirectRoute = new Elysia().get(
	"/:slug",
	async function handleRedirect({ params, request, set }) {
		const { slug } = params;
		const ip = extractIp(request);
		const ipHash = hashIp(ip);

		setAttributes({ link_slug: slug });

		// Rate limit check
		const rl = await rateLimit(`redirect:${ipHash}`, 100, 60);
		const headers = getRateLimitHeaders(rl);

		if (!rl.success) {
			setAttributes({ redirect_result: "rate_limited" });
			set.status = 429;
			set.headers = { ...headers, "Content-Type": "application/json" };
			return { error: "Too many requests" };
		}

		const link = await getLinkBySlug(slug);

		if (!link) {
			setAttributes({ redirect_result: "not_found" });
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(NOT_FOUND_URL, 302);
		}

		setAttributes({ link_id: link.id });

		// Check expiration
		const expired = link.expiresAt && new Date(link.expiresAt) < new Date();
		if (expired) {
			setAttributes({ redirect_result: "expired" });
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(link.expiredRedirectUrl ?? EXPIRED_URL, 302);
		}

		const userAgent = request.headers.get("user-agent");
		const targetUrl = getTargetUrl(link, userAgent);

		// Social bots get OG preview page
		if (isSocialBot(userAgent)) {
			setAttributes({ redirect_result: "og_preview" });
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(`${PROXY_URL}/${slug}`, 302);
		}

		// Regular bots skip caching
		if (isBot(userAgent)) {
			setAttributes({ redirect_result: "bot" });
			set.headers = { ...headers, "Cache-Control": "private, no-store" };
			return redirect(targetUrl, 302);
		}

		// ETag validation for regular users
		const etag = generateETag(link, targetUrl);
		if (request.headers.get("if-none-match") === etag) {
			setAttributes({ redirect_result: "not_modified" });
			set.status = 304;
			set.headers = { ...headers, "Cache-Control": "private, no-cache", ETag: etag };
			return;
		}

		// Record click async
		recordClick(link, ipHash, ip, request).catch((err) =>
			captureError(err, { link_id: link.id, operation: "record_click" })
		);

		setAttributes({ redirect_result: "success" });
		set.headers = { ...headers, "Cache-Control": "private, no-cache", ETag: etag };
		return redirect(targetUrl, 302);
	},
	{ params: t.Object({ slug: t.String() }) }
);
