import {
	getApiKeyFromHeader,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import {
	createMcpUnauthorizedResponse,
	handleDatabuddyMcpRequest,
} from "@databuddy/ai/mcp/http";
import { auth } from "@databuddy/auth";
import { getMcpAccessGrant } from "@databuddy/auth/mcp-grant";
import { MCP_GRANT_CLAIM } from "@databuddy/shared/mcp-access";
import { isApiScope } from "@databuddy/shared/api-scopes";
import { config } from "@databuddy/env/app";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { Elysia } from "elysia";
import {
	isMcpRequest,
	rejectInvalidMcpOrigin,
	rejectUnsupportedMcpMethod,
} from "@/http/cors";
import { getResolvedAuth } from "@/lib/auth-wide-event";

function isOAuthBearer(headers: Headers): boolean {
	const authorization = headers.get("authorization");
	if (!authorization?.toLowerCase().startsWith("bearer ")) {
		return false;
	}
	return !authorization.slice("bearer ".length).trim().startsWith("dbdy_");
}

const handleOAuthMcpRequest = createMcpProtectedRequestHandler(
	{
		issuer: config.urls.authorizationServer,
		audience: config.urls.mcp,
		jwksUrl: `${config.urls.authorizationServer}/jwks`,
	},
	async (request, claims) => {
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
);

function handleMcpRequest({
	request,
	user,
	apiKey,
	organizationId,
}: {
	apiKey: Awaited<ReturnType<typeof getApiKeyFromHeader>> | null;
	organizationId: string | null;
	request: Request;
	user: { id: string } | null;
}) {
	return handleDatabuddyMcpRequest({
		request,
		requestHeaders: request.headers,
		userId: user?.id ?? null,
		apiKey,
		organizationId,
	});
}

export const mcp = new Elysia({ name: "mcp" })
	.onRequest(({ request }) => {
		const rejected =
			rejectInvalidMcpOrigin(request) ?? rejectUnsupportedMcpMethod(request);
		if (rejected) {
			return rejected;
		}
		if (isMcpRequest(request) && isOAuthBearer(request.headers)) {
			return handleOAuthMcpRequest(request);
		}
	})
	.derive(async ({ request }) => {
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
			isAuthenticated: Boolean(user ?? apiKey),
			organizationId:
				apiKey?.organizationId ?? session?.session.activeOrganizationId ?? null,
		};
	})
	.onBeforeHandle(({ isAuthenticated, set }) => {
		if (!isAuthenticated) {
			set.status = 401;
			return createMcpUnauthorizedResponse();
		}
	})
	.all("/v1/mcp", handleMcpRequest)
	.all("/v1/mcp/", handleMcpRequest)
	.all("/mcp", handleMcpRequest)
	.all("/mcp/", handleMcpRequest);
