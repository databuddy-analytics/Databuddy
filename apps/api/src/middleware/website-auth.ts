import {
	getApiKeyFromHeader,
	hasWebsiteScope,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import { and, db, eq } from "@databuddy/db";
import { member } from "@databuddy/db/schema";
import { Elysia } from "elysia";
import { getResolvedAuth } from "../lib/auth-wide-event";
import { record } from "../lib/tracing";
import { getCachedWebsite, getTimezone } from "../lib/website-utils";

function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
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
					_authChecked: true,
				} as const;
			}

			const url = new URL(request.url);
			const websiteId = url.searchParams.get("website_id");

			const preResolved = getResolvedAuth(request.headers);
			let sessionUser: { id: string; name: string; email: string } | null =
				null;
			let session: Awaited<ReturnType<typeof auth.api.getSession>> | null =
				null;
			let apiKey: Awaited<ReturnType<typeof getApiKeyFromHeader>> | null = null;
			const apiKeyPresent = isApiKeyPresent(request.headers);

			if (preResolved) {
				session = preResolved.session;
				sessionUser = (session?.user as typeof sessionUser) ?? null;
				apiKey = preResolved.apiKeyResult?.key ?? null;
			} else {
				const [resolvedApiKey, resolvedSession] = await record(
					"getAuthContext",
					() =>
						Promise.all([
							apiKeyPresent
								? getApiKeyFromHeader(request.headers)
								: null,
							auth.api.getSession({ headers: request.headers }),
						])
				);
				session = resolvedSession;
				sessionUser = (session?.user as typeof sessionUser) ?? null;
				apiKey = resolvedApiKey;
			}

			const website = websiteId
				? await record("getCachedWebsite", () =>
						getCachedWebsite(websiteId)
					)
				: undefined;

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
		.onBeforeHandle(
			async ({ user, website, _apiKey, _apiKeyPresent, request }) => {
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
			}
		);
}

function isPreflight(request: Request): boolean {
	return request.method === "OPTIONS" || request.method === "HEAD";
}

async function checkWebsiteAuth(
	websiteId: string,
	sessionUser: { id: string; name: string; email: string } | null,
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
			where: and(
				eq(member.userId, sessionUser.id),
				eq(member.organizationId, website.organizationId)
			),
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
