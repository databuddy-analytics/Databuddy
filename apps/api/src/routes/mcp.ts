import {
	getApiKeyFromHeader,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import {
	createMcpErrorResponse,
	createMcpUnauthorizedResponse,
	handleDatabuddyMcpRequest,
} from "@databuddy/ai/mcp/http";
import { captureWarning, mergeWideEvent } from "@databuddy/ai/lib/tracing";
import { auth } from "@databuddy/auth";
import { getMcpAccessGrant } from "@databuddy/auth/mcp-grant";
import { MCP_GRANT_CLAIM } from "@databuddy/shared/mcp-access";
import { isApiScope } from "@databuddy/shared/api-scopes";
import { config } from "@databuddy/env/app";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { Elysia } from "elysia";
import { MCP_PATHS, rejectUnsupportedMcpMethod } from "@/http/cors";
import { getResolvedAuth } from "@/lib/auth-wide-event";
import { ApiKeyInFlightGate } from "@/middleware/api-key-rate-limit";

const BEARER_TOKEN_RE = /^bearer\s+(\S+)$/i;
const SIGNING_KEYS_URL = `${config.urls.authorizationServer}/jwks`;
const SIGNING_KEYS_MAX_AGE_MS = 300_000;
const SIGNING_KEYS_RECHECK_MS = 30_000;
const SIGNING_KEYS_TIMEOUT_MS = 5000;
const SIGNING_KEYS_RETRY_AFTER_SECONDS = 5;

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
	const tokenScopes =
		typeof claims.scope === "string"
			? claims.scope.split(" ").filter(isApiScope)
			: [];
	const authorization = await getMcpAccessGrant(
		subject,
		clientId,
		grantHash,
		tokenScopes
	);
	if (!authorization) {
		return createMcpUnauthorizedResponse();
	}
	mergeWideEvent({
		user_id: subject,
		organization_id: authorization.grant.organizationId,
	});
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
		return await handleDatabuddyMcpRequest({
			request,
			requestHeaders: request.headers,
			userId: subject,
			oauthScopes: authorization.scopes,
			oauthGrant: authorization.grant,
			oauthUserId: subject,
			apiKey: null,
			organizationId: authorization.grant.organizationId,
		});
	} finally {
		oauthInFlight.release(request);
	}
}

function readOAuthAccessToken(headers: Headers): string | null {
	if (!verifyOAuthMcpRequest) {
		return null;
	}
	const token = BEARER_TOKEN_RE.exec(
		headers.get("authorization")?.trim() ?? ""
	)?.[1];
	return token && !token.startsWith("dbdy_") ? token : null;
}

function readTokenKeyId(token: string): string | null {
	try {
		const header: unknown = JSON.parse(
			Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")
		);
		return header &&
			typeof header === "object" &&
			"kid" in header &&
			typeof header.kid === "string"
			? header.kid
			: null;
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
	const cached = await loadSigningKeyIds(SIGNING_KEYS_MAX_AGE_MS);
	if (cached.ids.has(keyId)) {
		return true;
	}
	const rechecked = await loadSigningKeyIds(SIGNING_KEYS_RECHECK_MS);
	return rechecked.ids.has(keyId);
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
	if (await isKnownSigningKey(keyId)) {
		const response = await verifyOAuthMcpRequest(request);
		if (response.status !== 401 || (await isSigningKeysReachable())) {
			return response;
		}
	} else if (await isSigningKeysReachable()) {
		return createMcpUnauthorizedResponse();
	}
	mergeWideEvent({ mcp_jwks_unavailable: true });
	return createMcpErrorResponse(
		503,
		-32_000,
		"Databuddy cannot verify access tokens right now. Retry shortly.",
		{ "Retry-After": String(SIGNING_KEYS_RETRY_AFTER_SECONDS) }
	);
}

function handleMcpRequest({
	request,
	user,
	apiKey,
	oauthAccessToken,
	organizationId,
}: {
	apiKey: Awaited<ReturnType<typeof getApiKeyFromHeader>> | null;
	oauthAccessToken: string | null;
	organizationId: string | null;
	request: Request;
	user: { id: string } | null;
}) {
	if (oauthAccessToken) {
		return handleOAuthMcpRequest(request, oauthAccessToken);
	}
	return handleDatabuddyMcpRequest({
		request,
		requestHeaders: request.headers,
		userId: user?.id ?? null,
		apiKey,
		organizationId,
	});
}

export const mcp = new Elysia({ name: "mcp" })
	.onRequest(({ request }) => rejectUnsupportedMcpMethod(request))
	.resolve(async ({ request }) => {
		const oauthAccessToken = readOAuthAccessToken(request.headers);
		if (oauthAccessToken) {
			return {
				user: null,
				apiKey: null,
				oauthAccessToken,
				isAuthenticated: false,
				organizationId: null,
			};
		}
		const preResolved = getResolvedAuth(request.headers);
		const hasApiKey = isApiKeyPresent(request.headers);
		const apiKey = hasApiKey
			? preResolved
				? (preResolved.apiKeyResult?.key ?? null)
				: await getApiKeyFromHeader(request.headers)
			: null;
		const session = hasApiKey
			? null
			: preResolved
				? preResolved.session
				: await auth.api.getSession({ headers: request.headers });

		const user = session?.user ?? null;
		return {
			user,
			apiKey,
			oauthAccessToken: null,
			isAuthenticated: Boolean(user ?? apiKey),
			organizationId:
				apiKey?.organizationId ?? session?.session.activeOrganizationId ?? null,
		};
	})
	.onBeforeHandle(({ isAuthenticated, oauthAccessToken, set }) => {
		if (!(isAuthenticated || oauthAccessToken)) {
			set.status = 401;
			return createMcpUnauthorizedResponse();
		}
	});

for (const path of MCP_PATHS) {
	mcp.all(path, handleMcpRequest);
}
