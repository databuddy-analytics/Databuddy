import {
	getApiKeyFromHeader,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import {
	createMcpUnauthorizedResponse,
	handleDatabuddyMcpRequest,
} from "@databuddy/ai/mcp/http";
import { auth } from "@databuddy/auth";
import { config } from "@databuddy/env/app";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { Elysia } from "elysia";
import {
	rejectInvalidMcpOrigin,
	rejectUnsupportedMcpMethod,
} from "@/http/cors";
import { getResolvedAuth } from "@/lib/auth-wide-event";

const AUTHORIZATION_SERVER = `${config.urls.dashboard}/api/auth`;

function isOAuthBearer(headers: Headers): boolean {
	const authorization = headers.get("authorization");
	if (!authorization?.toLowerCase().startsWith("bearer ")) {
		return false;
	}
	return !authorization.slice("bearer ".length).trim().startsWith("dbdy_");
}

const handleOAuthMcpRequest = createMcpProtectedRequestHandler(
	{
		issuer: AUTHORIZATION_SERVER,
		audience: config.urls.mcp,
		jwksUrl: `${AUTHORIZATION_SERVER}/jwks`,
	},
	(request, claims) =>
		handleDatabuddyMcpRequest({
			request,
			requestHeaders: request.headers,
			userId: typeof claims.sub === "string" ? claims.sub : null,
			oauthUserId: typeof claims.sub === "string" ? claims.sub : null,
			apiKey: null,
			organizationId: null,
		})
);

function handleMcpRequest({
	request,
	user,
	apiKey,
	organizationId,
	isOAuth,
}: {
	apiKey: Awaited<ReturnType<typeof getApiKeyFromHeader>> | null;
	isOAuth: boolean;
	organizationId: string | null;
	request: Request;
	user: { id: string } | null;
}) {
	if (isOAuth) {
		return handleOAuthMcpRequest(request);
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
	.onRequest(
		({ request }) =>
			rejectInvalidMcpOrigin(request) ?? rejectUnsupportedMcpMethod(request)
	)
	.derive(async ({ request }) => {
		if (isOAuthBearer(request.headers)) {
			return {
				user: null,
				apiKey: null,
				isAuthenticated: true,
				isOAuth: true,
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
			isAuthenticated: Boolean(user ?? apiKey),
			isOAuth: false,
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
