import { auth } from '@databuddy/auth';
import { db, userPreferences, websites } from '@databuddy/db';
import { cacheable } from '@databuddy/redis';
import type { Website } from '@databuddy/shared';
import { eq } from 'drizzle-orm';

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

const getCachedSession = cacheable(
	async (headers: Headers) => {
		return await auth.api.getSession({
			headers,
		});
	},
	{
		expireInSec: 60,
		prefix: 'auth-session',
		staleWhileRevalidate: true,
		staleTime: 30,
	}
);

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
	const url = new URL(request.url);
	const website_id = url.searchParams.get('website_id');

	const session = await getCachedSession(request.headers);

	if (!website_id) {
		if (!session?.user) {
			throw new Error('Unauthorized');
		}
		const timezone = await getTimezone(request, session);
		return { user: session.user, session, timezone };
	}

	const [website, timezone] = await Promise.all([
		getCachedWebsite(website_id),
		website_id && session?.user
			? getTimezone(request, session)
			: getTimezone(request, null),
	]);

	if (!website) {
		throw new Error('Website not found');
	}

	if (website.isPublic) {
		return { user: null, session: null, website, timezone };
	}

	if (!session?.user) {
		throw new Error('Unauthorized');
	}

	return { user: session.user, session, website, timezone };
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
