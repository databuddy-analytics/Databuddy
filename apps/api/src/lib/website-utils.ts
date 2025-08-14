import { auth } from '@databuddy/auth';
import { db, userPreferences, websites } from '@databuddy/db';
import { cacheable } from '@databuddy/redis';
import type { Website } from '@databuddy/shared';
import { eq } from 'drizzle-orm';
import {
	getApiKeyFromHeader,
	hasWebsiteScope,
	isApiKeyPresent,
} from './api-key';

export interface WebsiteContext {
	user: unknown;
	session: unknown;
	website?: Website;
	timezone: string;
}

export interface WebsiteValidationResult {
	success: boolean;
	website?: Website;
	error?: string;
}

const getCachedWebsite = cacheable(
	async (websiteId: string) => {
		try {
			const website = await db.query.websites.findFirst({
				where: eq(websites.id, websiteId),
			});
			return website || null;
		} catch {
			return null;
		}
	},
	{
		expireInSec: 300,
		prefix: 'website-cache',
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

const getWebsiteDomain = cacheable(
	async (websiteId: string): Promise<string | null> => {
		try {
			const website = await db.query.websites.findFirst({
				where: eq(websites.id, websiteId),
			});
			return website?.domain || null;
		} catch {
			return null;
		}
	},
	{
		expireInSec: 300,
		prefix: 'website-domain',
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

const getCachedWebsiteDomain = cacheable(
	async (websiteIds: string[]): Promise<Record<string, string | null>> => {
		const results: Record<string, string | null> = {};

		await Promise.all(
			websiteIds.map(async (id) => {
				results[id] = await getWebsiteDomain(id);
			})
		);

		return results;
	},
	{
		expireInSec: 300,
		prefix: 'website-domains-batch',
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

const userPreferencesCache = cacheable(
	async (userId: string) => {
		try {
			return await db.query.userPreferences.findFirst({
				where: eq(userPreferences.userId, userId),
			});
		} catch {
			return null;
		}
	},
	{
		expireInSec: 600,
		prefix: 'user-prefs',
		staleWhileRevalidate: true,
		staleTime: 120,
	}
);

// Removed unused cached session helper to satisfy linter rules

export async function getTimezone(
	request: Request,
	session: { user?: { id: string } } | null
): Promise<string> {
	const url = new URL(request.url);
	const headerTimezone = request.headers.get('x-timezone');
	const paramTimezone = url.searchParams.get('timezone');

	if (session?.user) {
		const pref = await userPreferencesCache(session.user.id);
		if (pref?.timezone && pref.timezone !== 'auto') {
			return pref.timezone;
		}
	}

	return headerTimezone || paramTimezone || 'UTC';
}

export async function deriveWebsiteContext({ request }: { request: Request }) {
	if (isApiKeyPresent(request.headers)) {
		return await deriveWithApiKey(request);
	}
	return await deriveWithSession(request);
}

async function deriveWithApiKey(request: Request) {
	const url = new URL(request.url);
	const siteId = url.searchParams.get('website_id');

	const key = await getApiKeyFromHeader(request.headers);
	if (!key) {
		throw new Error('Unauthorized');
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
		throw new Error('Website not found');
	}

	if (site.isPublic) {
		return { user: null, session: null, website: site, timezone } as const;
	}

	const canRead = await hasWebsiteScope(key, siteId, 'read:data');
	if (!canRead) {
		throw new Error('Forbidden');
	}

	return { user: null, session: null, website: site, timezone } as const;
}

async function deriveWithSession(request: Request) {
	const url = new URL(request.url);
	const websiteId = url.searchParams.get('website_id');
	const session = await auth.api.getSession({ headers: request.headers });

	if (!websiteId) {
		if (!session?.user) {
			throw new Error('Unauthorized');
		}
		const tz = await getTimezone(request, session);
		return { user: session.user, session, timezone: tz } as const;
	}

	const tz = session?.user
		? await getTimezone(request, session)
		: await getTimezone(request, null);
	const site = await getCachedWebsite(websiteId);

	if (!site) {
		throw new Error('Website not found');
	}

	if (site.isPublic) {
		return { user: null, session: null, website: site, timezone: tz } as const;
	}

	if (!session?.user) {
		throw new Error('Unauthorized');
	}

	return { user: session.user, session, website: site, timezone: tz } as const;
}

export async function validateWebsite(
	websiteId: string
): Promise<WebsiteValidationResult> {
	const website = await getCachedWebsite(websiteId);

	if (!website) {
		return { success: false, error: 'Website not found' };
	}

	return { success: true, website };
}

export { getWebsiteDomain, getCachedWebsiteDomain, getCachedWebsite };
