import {
	getAccessibleWebsiteIds,
	getApiKeyFromHeader,
	hasWebsiteScope,
	isApiKeyPresent,
	type ApiKeyRow,
} from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import { db } from "@databuddy/db";
import { cacheNamespaces, cacheTags, cacheable } from "@databuddy/redis";
import type { Website } from "@databuddy/db/schema";
import { validateTimezone } from "@databuddy/validation";

export interface WebsiteContext {
	session: unknown;
	timezone: string;
	user: unknown;
	website?: Website;
}

export interface WebsiteValidationResult {
	error?: string;
	success: boolean;
	website?: Website;
}

const getCachedWebsite = cacheable(
	async (websiteId: string) => {
		try {
			const website = await db.query.websites.findFirst({
				where: { id: websiteId },
			});
			return website || null;
		} catch {
			return null;
		}
	},
	{
		expireInSec: 300,
		prefix: cacheNamespaces.websiteCache,
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

const getWebsiteDomain = cacheable(
	async (websiteId: string): Promise<string | null> => {
		try {
			const website = await db.query.websites.findFirst({
				where: { id: websiteId },
			});
			return website?.domain || null;
		} catch {
			return null;
		}
	},
	{
		expireInSec: 300,
		prefix: cacheNamespaces.websiteDomain,
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

const getCachedWebsiteDomain = cacheable(
	async (websiteIds: string[]): Promise<Record<string, string | null>> => {
		if (websiteIds.length === 0) {
			return {};
		}

		try {
			const websitesList = await db.query.websites.findMany({
				where: { id: { in: websiteIds } },
				columns: { id: true, domain: true },
			});

			const results: Record<string, string | null> = {};
			for (const id of websiteIds) {
				results[id] = null;
			}
			for (const website of websitesList) {
				results[website.id] = website.domain;
			}

			return results;
		} catch {
			return Object.fromEntries(websiteIds.map((id) => [id, null]));
		}
	},
	{
		expireInSec: 300,
		prefix: cacheNamespaces.websiteDomainsBatch,
		staleWhileRevalidate: true,
		staleTime: 60,
		tags: (_result, websiteIds) => websiteIds.map(cacheTags.website),
	}
);

const userPreferencesCache = cacheable(
	async (userId: string) => {
		try {
			return await db.query.userPreferences.findFirst({
				where: { userId },
			});
		} catch {
			return null;
		}
	},
	{
		expireInSec: 600,
		prefix: cacheNamespaces.userPreferences,
		staleWhileRevalidate: true,
		staleTime: 120,
	}
);

export async function getTimezone(
	request: Request,
	session: { user?: { id: string } } | null
): Promise<string> {
	const url = new URL(request.url);
	const headerTimezone = request.headers.get("x-timezone");
	const paramTimezone = url.searchParams.get("timezone");

	if (session?.user) {
		const pref = await userPreferencesCache(session.user.id);
		if (pref?.timezone && pref.timezone !== "auto") {
			return pref.timezone;
		}
	}

	return validateTimezone(headerTimezone || paramTimezone) || "UTC";
}

export async function deriveWebsiteContext({ request }: { request: Request }) {
	if (isApiKeyPresent(request.headers)) {
		return await deriveWithApiKey(request);
	}
	return await deriveWithSession(request);
}

function jsonError(status: number, error: string, code: string): Response {
	return new Response(JSON.stringify({ success: false, error, code }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function deriveWithApiKey(request: Request) {
	const url = new URL(request.url);
	const siteId = url.searchParams.get("website_id");

	const key = await getApiKeyFromHeader(request.headers);
	if (!key) {
		throw jsonError(401, "Authentication required", "AUTH_REQUIRED");
	}

	if (!siteId) {
		const timezoneNoSite = await getTimezone(request, null);
		return { user: null, session: null, timezone: timezoneNoSite } as const;
	}

	const [site, timezone] = await Promise.all([
		getCachedWebsite(siteId),
		getTimezone(request, null),
	]);

	if (!site) {
		throw jsonError(404, "Website not found", "NOT_FOUND");
	}

	if (site.isPublic) {
		return { user: null, session: null, website: site, timezone } as const;
	}

	const canRead = await hasWebsiteScope(key, siteId, "read:data");
	if (!canRead) {
		if (isKnownWebsiteForKey(key, site)) {
			throw jsonError(403, "Insufficient permissions", "FORBIDDEN");
		}
		throw jsonError(404, "Website not found", "NOT_FOUND");
	}

	return { user: null, session: null, website: site, timezone } as const;
}

function isKnownWebsiteForKey(key: ApiKeyRow, site: Website): boolean {
	return (
		(key.organizationId != null &&
			key.organizationId === site.organizationId) ||
		getAccessibleWebsiteIds(key).includes(site.id)
	);
}

async function deriveWithSession(request: Request) {
	const url = new URL(request.url);
	const websiteId = url.searchParams.get("website_id");
	const session = await auth.api.getSession({ headers: request.headers });

	if (!websiteId) {
		if (!session?.user) {
			throw jsonError(401, "Authentication required", "AUTH_REQUIRED");
		}
		const tz = await getTimezone(request, session);
		return { user: session.user, session, timezone: tz } as const;
	}

	const tz = session?.user
		? await getTimezone(request, session)
		: await getTimezone(request, null);
	const site = await getCachedWebsite(websiteId);

	if (!site) {
		throw jsonError(404, "Website not found", "NOT_FOUND");
	}

	if (site.isPublic) {
		return { user: null, session: null, website: site, timezone: tz } as const;
	}

	if (!session?.user) {
		throw jsonError(401, "Authentication required", "AUTH_REQUIRED");
	}

	return { user: session.user, session, website: site, timezone: tz } as const;
}

export async function validateWebsite(
	websiteId: string
): Promise<WebsiteValidationResult> {
	const website = await getCachedWebsite(websiteId);

	if (!website) {
		return { success: false, error: "Website not found" };
	}

	return { success: true, website };
}

export { getCachedWebsite, getCachedWebsiteDomain, getWebsiteDomain };
