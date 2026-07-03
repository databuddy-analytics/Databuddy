import {
	getApiKeyFromHeader,
	hasKeyScope,
	isApiKeyPresent,
} from "@databuddy/api-keys/resolve";
import {
	createMcpUnauthorizedResponse,
	handleDatabuddyMcpRequest,
} from "@databuddy/ai/mcp/http";
import { auth } from "@databuddy/auth";
import { config } from "@databuddy/env/app";
import { Elysia } from "elysia";

const PROTECTED_RESOURCE_METADATA_URL = `${config.urls.api}/.well-known/oauth-protected-resource`;

async function handleMcpRequest({
	request,
	user,
	apiKey,
}: {
	apiKey: Awaited<ReturnType<typeof getApiKeyFromHeader>> | null;
	request: Request;
	user: { id: string } | null;
}) {
	return await handleDatabuddyMcpRequest({
		request,
		requestHeaders: request.headers,
		userId: user?.id ?? null,
		apiKey,
	});
}

export const mcp = new Elysia({ name: "mcp" })
	.derive(async ({ request }) => {
		const hasApiKey = isApiKeyPresent(request.headers);
		const [apiKey, session] = await Promise.all([
			hasApiKey ? getApiKeyFromHeader(request.headers) : null,
			auth.api.getSession({ headers: request.headers }),
		]);

		if (apiKey && !hasKeyScope(apiKey, "read:data")) {
			return {
				user: null,
				apiKey: null,
				isAuthenticated: false,
			};
		}

		const user = session?.user ?? null;
		return {
			user,
			apiKey,
			isAuthenticated: Boolean(user ?? apiKey),
		};
	})
	.onBeforeHandle(async ({ request, isAuthenticated, set }) => {
		if (!isAuthenticated) {
			set.status = 401;
			return await createMcpUnauthorizedResponse(request, {
				resourceMetadataUrl: PROTECTED_RESOURCE_METADATA_URL,
			});
		}
	})
	.all(
		"/v1/mcp",
		async ({ request, user, apiKey }) =>
			await handleMcpRequest({ request, user, apiKey })
	)
	.all(
		"/v1/mcp/",
		async ({ request, user, apiKey }) =>
			await handleMcpRequest({ request, user, apiKey })
	)
	.all(
		"/mcp",
		async ({ request, user, apiKey }) =>
			await handleMcpRequest({ request, user, apiKey })
	)
	.all(
		"/mcp/",
		async ({ request, user, apiKey }) =>
			await handleMcpRequest({ request, user, apiKey })
	)
	.all(
		"/.well-known/mcp",
		async ({ request, user, apiKey }) =>
			await handleMcpRequest({ request, user, apiKey })
	);
