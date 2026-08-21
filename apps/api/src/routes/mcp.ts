import {
	getApiKeyFromHeader,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import {
	createMcpUnauthorizedResponse,
	handleDatabuddyMcpRequest,
} from "@databuddy/ai/mcp/http";
import { auth } from "@databuddy/auth";
import { Elysia } from "elysia";
import {
	rejectInvalidMcpOrigin,
	rejectUnsupportedMcpMethod,
} from "@/http/cors";
import { getResolvedAuth } from "@/lib/auth-wide-event";

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
	.onRequest(
		({ request }) =>
			rejectInvalidMcpOrigin(request) ?? rejectUnsupportedMcpMethod(request)
	)
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
