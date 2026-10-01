import {
	getApiKeyFromHeader,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import {
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

const BEARER_TOKEN_RE = /^bearer\s+(\S+)$/i;

function createOAuthMcpRequestHandler() {
	try {
		return createMcpProtectedRequestHandler(
			{
				issuer: config.urls.authorizationServer,
				audience: config.urls.mcp,
				jwksUrl: `${config.urls.authorizationServer}/jwks`,
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
	return handleDatabuddyMcpRequest({
		request,
		requestHeaders: request.headers,
		userId: subject,
		oauthScopes: authorization.scopes,
		oauthGrant: authorization.grant,
		oauthUserId: subject,
		apiKey: null,
		organizationId: authorization.grant.organizationId,
	});
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
	if (oauthAccessToken && verifyOAuthMcpRequest) {
		return verifyOAuthMcpRequest(request);
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
