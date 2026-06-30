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
import { Elysia } from "elysia";

export const mcp = new Elysia({ prefix: "/v1/mcp" })
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
			return await createMcpUnauthorizedResponse(request);
		}
	})
	.all(
		"/",
		async ({ request, user, apiKey }) =>
			await handleDatabuddyMcpRequest({
				request,
				requestHeaders: request.headers,
				userId: user?.id ?? null,
				apiKey,
			})
	);
