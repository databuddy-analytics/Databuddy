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

export async function getTimezone(
	request: Request,
	session: { user?: { id: string } } | null
): Promise<string> {
	const url = new URL(request.url);
	const headerTimezone = request.headers.get('x-timezone');
	const paramTimezone = url.searchParams.get('timezone');

	if (session?.user) {
		const pref = await db.query.userPreferences.findFirst({
			where: eq(userPreferences.userId, session.user.id),
		});
		if (pref?.timezone && pref.timezone !== 'auto') {
			return pref.timezone;
		}
	}

	return headerTimezone || paramTimezone || 'UTC';
}

export async function deriveWebsiteContext({ request }: { request: Request }) {
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	const url = new URL(request.url);
	const website_id = url.searchParams.get('website_id');

	if (!website_id) {
		if (!session?.user) {
			throw new Error('Unauthorized');
		}
		const timezone = await getTimezone(request, session);
		return { user: session.user, session, timezone };
	}

	const website = await getCachedWebsite(website_id);

	if (!website) {
		throw new Error('Website not found');
	}

	if (website.isPublic) {
		const timezone = await getTimezone(request, null);
		return { user: null, session: null, website, timezone };
	}

	if (!session?.user) {
		throw new Error('Unauthorized');
	}

	const timezone = await getTimezone(request, session);
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
