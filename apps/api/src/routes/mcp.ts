import { isApiKeyPresent } from "@databuddy/api-keys/resolve";
import {
	createMcpErrorResponse,
	createMcpUnauthorizedResponse,
	handleDatabuddyMcpRequest,
} from "@databuddy/ai/mcp/http";
import { captureWarning, mergeWideEvent } from "@databuddy/ai/lib/tracing";
import { getMcpAccessGrant } from "@databuddy/auth/mcp-grant";
import { MCP_GRANT_CLAIM } from "@databuddy/shared/mcp-access";
import type { ApiAuthWideEventFields } from "@databuddy/shared/evlog-fields";
import { db, eq } from "@databuddy/db";
import { oauthClient } from "@databuddy/db/schema";
import { config } from "@databuddy/env/app";
import { cacheable } from "@databuddy/redis";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { Elysia } from "elysia";
import {
	MCP_PATHS,
	readMcpOAuthToken,
	rejectUnsupportedMcpMethod,
} from "@/http/cors";
import { resolveRequestAuth } from "@/lib/auth-wide-event";
import { ApiKeyInFlightGate } from "@/middleware/api-key-rate-limit";

const SIGNING_KEYS_URL = `${config.urls.authorizationServer}/jwks`;
const SIGNING_KEYS_MAX_AGE_MS = 300_000;
const SIGNING_KEYS_RECHECK_MS = 30_000;
const SIGNING_KEYS_TIMEOUT_MS = 5000;
const SIGNING_KEYS_RETRY_AFTER_SECONDS = 5;
const OAUTH_USER_TTL_SEC = 15;

interface SigningKeyIds {
	checkedAt: number;
	ids: ReadonlySet<string>;
	reachable: boolean;
}

let signingKeyIds: SigningKeyIds = {
	checkedAt: 0,
	ids: new Set(),
	reachable: true,
};
let signingKeyIdsRefresh: Promise<SigningKeyIds> | null = null;

const oauthInFlight = new ApiKeyInFlightGate();

const loadOAuthUser = cacheable(
	async (userId: string) =>
		(await db.query.user.findFirst({ where: { id: userId } })) ?? null,
	{ expireInSec: OAUTH_USER_TTL_SEC, prefix: "mcp:oauth-user" }
);

const loadOAuthClientName = cacheable(
	async (clientId: string) => {
		const [client] = await db
			.select({ name: oauthClient.name })
			.from(oauthClient)
			.where(eq(oauthClient.clientId, clientId))
			.limit(1);
		return client?.name ?? null;
	},
	{ expireInSec: 3600, prefix: "mcp:oauth-client-name" }
);

function createOAuthMcpRequestHandler() {
	try {
		return createMcpProtectedRequestHandler(
			{
				issuer: config.urls.authorizationServer,
				audience: config.urls.mcp,
				jwksUrl: SIGNING_KEYS_URL,
			},
			handleVerifiedOAuthRequest
		);
	} catch (error) {
		captureWarning(error, { mcp_oauth_disabled: true });
		return null;
	}
}

const verifyOAuthMcpRequest = createOAuthMcpRequestHandler();

async function handleVerifiedOAuthRequest(
	request: Request,
	claims: Record<string, unknown>
): Promise<Response> {
	const subject = typeof claims.sub === "string" ? claims.sub : null;
	const clientId = typeof claims.azp === "string" ? claims.azp : null;
	const grantHash = claims[MCP_GRANT_CLAIM];
	if (!(subject && clientId && typeof grantHash === "string")) {
		return createMcpUnauthorizedResponse();
	}
	if (!oauthInFlight.tryAcquire(request, `${subject}:${clientId}`)) {
		mergeWideEvent({ mcp_rate_limited: true });
		return createMcpErrorResponse(
			429,
			-32_000,
			"Too many concurrent requests for this connection. Retry shortly.",
			{ "Retry-After": "1" }
		);
	}
	try {
		const tokenScopes =
			typeof claims.scope === "string" ? claims.scope.split(" ") : [];
		const [authorization, user, clientName] = await Promise.all([
			getMcpAccessGrant(subject, clientId, grantHash, tokenScopes),
			loadOAuthUser(subject),
			loadOAuthClientName(clientId),
		]);
		if (!(authorization && user)) {
			return createMcpUnauthorizedResponse();
		}
		mergeWideEvent<ApiAuthWideEventFields>({
			auth_method: "oauth",
			user_id: subject,
			organization_id: authorization.grant.organizationId,
		});
		return await handleDatabuddyMcpRequest({
			request,
			requestHeaders: request.headers,
			userId: null,
			oauth: { ...authorization, user },
			apiKey: null,
			clientName: clientName ?? undefined,
		});
	} finally {
		oauthInFlight.release(request);
	}
}

function readTokenKeyId(token: string): string | null {
	try {
		const { kid } = JSON.parse(
			Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")
		) as { kid?: unknown };
		return typeof kid === "string" ? kid : null;
	} catch {
		return null;
	}
}

async function fetchSigningKeyIds(): Promise<SigningKeyIds> {
	try {
		const response = await fetch(SIGNING_KEYS_URL, {
			headers: { Accept: "application/json" },
			redirect: "error",
			signal: AbortSignal.timeout(SIGNING_KEYS_TIMEOUT_MS),
		});
		if (!response.ok) {
			throw new Error(`Authorization server JWKS returned ${response.status}`);
		}
		const { keys } = (await response.json()) as {
			keys?: { kid?: unknown }[];
		};
		return {
			checkedAt: Date.now(),
			ids: new Set(
				(keys ?? []).flatMap((key) =>
					typeof key.kid === "string" ? [key.kid] : []
				)
			),
			reachable: true,
		};
	} catch (error) {
		captureWarning(error, { mcp_jwks_unavailable: true });
		return {
			checkedAt: Date.now(),
			ids: signingKeyIds.ids,
			reachable: false,
		};
	}
}

function loadSigningKeyIds(maxAgeMs: number): Promise<SigningKeyIds> {
	const maxAge = signingKeyIds.reachable ? maxAgeMs : SIGNING_KEYS_RECHECK_MS;
	if (Date.now() - signingKeyIds.checkedAt < maxAge) {
		return Promise.resolve(signingKeyIds);
	}
	signingKeyIdsRefresh ??= fetchSigningKeyIds().then((next) => {
		signingKeyIds = next;
		signingKeyIdsRefresh = null;
		return next;
	});
	return signingKeyIdsRefresh;
}

async function isKnownSigningKey(keyId: string): Promise<boolean> {
	return (
		(await loadSigningKeyIds(SIGNING_KEYS_MAX_AGE_MS)).ids.has(keyId) ||
		(await loadSigningKeyIds(SIGNING_KEYS_RECHECK_MS)).ids.has(keyId)
	);
}

async function isSigningKeysReachable(): Promise<boolean> {
	return (await loadSigningKeyIds(SIGNING_KEYS_RECHECK_MS)).reachable;
}

async function handleOAuthMcpRequest(
	request: Request,
	accessToken: string
): Promise<Response> {
	const keyId = readTokenKeyId(accessToken);
	if (!(verifyOAuthMcpRequest && keyId)) {
		return createMcpUnauthorizedResponse();
	}
	const response = (await isKnownSigningKey(keyId))
		? await verifyOAuthMcpRequest(request).catch(async (error: unknown) => {
				if (await isSigningKeysReachable()) {
					throw error;
				}
				return null;
			})
		: null;
	if (response && response.status !== 401) {
		return response;
	}
	if (await isSigningKeysReachable()) {
		return response ?? createMcpUnauthorizedResponse();
	}
	mergeWideEvent({ mcp_jwks_unavailable: true });
	return createMcpErrorResponse(
		503,
		-32_000,
		"Databuddy cannot verify access tokens right now. Retry shortly.",
		{ "Retry-After": String(SIGNING_KEYS_RETRY_AFTER_SECONDS) }
	);
}

export const mcp = new Elysia({ name: "mcp" })
	.onRequest(({ request }) => rejectUnsupportedMcpMethod(request))
	.resolve(async ({ request }) => {
		const oauthAccessToken = verifyOAuthMcpRequest
			? readMcpOAuthToken(request)
			: null;
		if (oauthAccessToken) {
			return {
				user: null,
				apiKey: null,
				oauthAccessToken,
				organizationId: null,
			};
		}
		const { apiKey, session } = await resolveRequestAuth(request.headers);
		const user = isApiKeyPresent(request.headers)
			? null
			: (session?.user ?? null);
		return {
			user,
			apiKey,
			oauthAccessToken: null,
			organizationId:
				apiKey?.organizationId ??
				(user ? session?.session.activeOrganizationId : null) ??
				null,
		};
	})
	.onBeforeHandle(({ user, apiKey, oauthAccessToken, set }) => {
		if (!(user || apiKey || oauthAccessToken)) {
			set.status = 401;
			return createMcpUnauthorizedResponse();
		}
	});

for (const path of MCP_PATHS) {
	mcp.all(
		path,
		async ({
			request,
			set,
			user,
			apiKey,
			oauthAccessToken,
			organizationId,
		}) => {
			const response = oauthAccessToken
				? await handleOAuthMcpRequest(request, oauthAccessToken)
				: await handleDatabuddyMcpRequest({
						request,
						requestHeaders: request.headers,
						userId: user?.id ?? null,
						apiKey,
						organizationId,
					});
			set.status = response.status;
			return response;
		}
	);
}
