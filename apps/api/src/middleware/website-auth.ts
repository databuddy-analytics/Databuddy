import {
	getApiKeyFromHeader,
	hasWebsiteScope,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import { db } from "@databuddy/db";
import { Elysia } from "elysia";
import { getResolvedAuth } from "../lib/auth-wide-event";
import { getCachedWebsite, getTimezone } from "@databuddy/ai/lib/website-utils";

interface SessionUser {
	email: string;
	id: string;
	name: string;
}

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function getSessionUser(
	session: Awaited<ReturnType<typeof auth.api.getSession>> | null
): SessionUser | null {
	if (!session?.user) {
		return null;
	}

	return {
		email: session.user.email,
		id: session.user.id,
		name: session.user.name,
	};
}

export function websiteAuth() {
	return new Elysia()
		.derive(async ({ request }) => {
			if (isPreflight(request)) {
				return {
					user: null,
					session: null,
					website: undefined,
					timezone: "UTC",
					_apiKey: null,
					_apiKeyPresent: false,
					_authChecked: true,
				} as const;
			}

			const url = new URL(request.url);
			const websiteId = url.searchParams.get("website_id");

			const preResolved = getResolvedAuth(request.headers);
			let sessionUser: SessionUser | null = null;
			let session: Awaited<ReturnType<typeof auth.api.getSession>> | null =
				null;
			let apiKey: Awaited<ReturnType<typeof getApiKeyFromHeader>> | null = null;
			const apiKeyPresent = isApiKeyPresent(request.headers);

			if (preResolved) {
				session = preResolved.session;
				sessionUser = getSessionUser(session);
				apiKey = preResolved.apiKeyResult?.key ?? null;
			} else {
				const [resolvedApiKey, resolvedSession] = await Promise.all([
					apiKeyPresent ? getApiKeyFromHeader(request.headers) : null,
					auth.api.getSession({ headers: request.headers }),
				]);
				session = resolvedSession;
				sessionUser = getSessionUser(session);
				apiKey = resolvedApiKey;
			}

			const website = websiteId ? await getCachedWebsite(websiteId) : undefined;

			const timezone = session?.user
				? await getTimezone(request, session)
				: await getTimezone(request, null);

			return {
				user: sessionUser,
				session,
				website,
				timezone,
				_apiKey: apiKey,
				_apiKeyPresent: apiKeyPresent,
				_authChecked: true,
			} as const;
		})
		.onBeforeHandle(({ user, website, _apiKey, _apiKeyPresent, request }) => {
			if (isPreflight(request)) {
				return;
			}

			const url = new URL(request.url);
			const websiteId = url.searchParams.get("website_id");

			if (!websiteId) {
				if (user || _apiKey) {
					return null;
				}
				return json(401, {
					success: false,
					error: "Authentication required",
					code: "AUTH_REQUIRED",
				});
			}

			return checkWebsiteAuth(
				websiteId,
				user,
				website ?? null,
				_apiKey,
				_apiKeyPresent
			);
		});
}

function isPreflight(request: Request): boolean {
	return request.method === "OPTIONS" || request.method === "HEAD";
}

async function checkWebsiteAuth(
	websiteId: string,
	sessionUser: SessionUser | null,
	website: Awaited<ReturnType<typeof getCachedWebsite>> | null,
	apiKey: Awaited<ReturnType<typeof getApiKeyFromHeader>> | null,
	apiKeyPresent: boolean
): Promise<Response | null> {
	if (!website) {
		return json(404, {
			success: false,
			error: "Website not found",
			code: "NOT_FOUND",
		});
	}
	if (website.isPublic) {
		return null;
	}

	if (sessionUser) {
		if (!website.organizationId) {
			return json(403, {
				success: false,
				error: "Website must belong to a workspace",
				code: "FORBIDDEN",
			});
		}

		const membership = await db.query.member.findFirst({
			where: { userId: sessionUser.id, organizationId: website.organizationId },
			columns: {
				id: true,
			},
		});

		if (membership) {
			return null;
		}

		return json(403, {
			success: false,
			error: "Access denied to this website",
			code: "FORBIDDEN",
		});
	}

	if (!apiKeyPresent) {
		return json(401, {
			success: false,
			error: "Authentication required",
			code: "AUTH_REQUIRED",
		});
	}
	if (!apiKey) {
		return json(401, {
			success: false,
			error: "Invalid or expired API key",
			code: "AUTH_REQUIRED",
		});
	}
	const ok = await hasWebsiteScope(apiKey, websiteId, "read:data");
	if (!ok) {
		return json(403, {
			success: false,
			error: "Insufficient permissions",
			code: "FORBIDDEN",
		});
	}
	return null;
}
