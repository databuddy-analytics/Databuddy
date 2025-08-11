import { auth } from '@databuddy/auth';
import { Elysia } from 'elysia';
import {
	getApiKeyFromHeader,
	hasWebsiteScope,
	isApiKeyPresent,
} from '../lib/api-key';
import { getCachedWebsite, getTimezone } from '../lib/website-utils';

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export function websiteAuth() {
	return new Elysia()
		.onRequest(async ({ request }) => {
			if (isPreflight(request)) {
				return;
			}

			const debug = shouldDebug();
			const rid = Math.random().toString(36).slice(2, 8);
			if (debug) {
				console.time(`websiteAuth:${rid}`);
			}

			const url = new URL(request.url);
			const websiteId = url.searchParams.get('website_id');
			const { sessionUser, apiKey, apiKeyPresent } =
				await getAuthContext(request);

			const outcome = websiteId
				? await checkWebsiteAuth(websiteId, sessionUser, apiKey, apiKeyPresent)
				: checkNoWebsiteAuth(sessionUser, apiKey);

			if (debug) {
				console.timeEnd(`websiteAuth:${rid}`);
			}
			return outcome;
		})
		.derive(async ({ request }) => {
			const url = new URL(request.url);
			const websiteId = url.searchParams.get('website_id');
			const apiKeyPresent = isApiKeyPresent(request.headers);
			const session = apiKeyPresent
				? null
				: await auth.api.getSession({ headers: request.headers });
			const timezone = session?.user
				? await getTimezone(request, session)
				: await getTimezone(request, null);
			const website = websiteId ? await getCachedWebsite(websiteId) : undefined;
			return {
				user: session?.user ?? null,
				session,
				website,
				timezone,
			} as const;
		});
}

function isPreflight(request: Request): boolean {
	return request.method === 'OPTIONS' || request.method === 'HEAD';
}

function shouldDebug(): boolean {
	return process.env.NODE_ENV === 'development';
}

async function getAuthContext(request: Request) {
	const apiKeyPresent = request.headers.get('x-api-key') != null;
	const apiKey = apiKeyPresent
		? await getApiKeyFromHeader(request.headers)
		: null;
	const session = await auth.api.getSession({ headers: request.headers });
	const sessionUser = session?.user ?? null;
	return { sessionUser, apiKey, apiKeyPresent } as const;
}

function checkNoWebsiteAuth(
	sessionUser: unknown,
	apiKey: unknown
): Response | null {
	if (sessionUser || apiKey) {
		return null;
	}
	return json(401, {
		success: false,
		error: 'Authentication required',
		code: 'AUTH_REQUIRED',
	});
}

async function checkWebsiteAuth(
	websiteId: string,
	sessionUser: unknown,
	apiKey: Parameters<typeof hasWebsiteScope>[0] | null,
	apiKeyPresent: boolean
): Promise<Response | null> {
	const website = await getCachedWebsite(websiteId);
	if (!website) {
		return json(404, {
			success: false,
			error: 'Website not found',
			code: 'NOT_FOUND',
		});
	}
	if (website.isPublic) {
		return null;
	}
	if (sessionUser) {
		return null;
	}
	if (!apiKeyPresent) {
		return json(401, {
			success: false,
			error: 'Authentication required',
			code: 'AUTH_REQUIRED',
		});
	}
	if (!apiKey) {
		return json(401, {
			success: false,
			error: 'Invalid or expired API key',
			code: 'AUTH_REQUIRED',
		});
	}
	const ok = await hasWebsiteScope(apiKey, websiteId, 'read:data');
	if (!ok) {
		return json(403, {
			success: false,
			error: 'Insufficient permissions',
			code: 'FORBIDDEN',
		});
	}
	return null;
}
