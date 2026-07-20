import {
	getAccessibleWebsiteIds,
	getApiKeyFromHeader,
	hasKeyScope,
	hasWebsiteScope,
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

function canReadMcp(
	apiKey: NonNullable<Awaited<ReturnType<typeof getApiKeyFromHeader>>>
) {
	return (
		hasKeyScope(apiKey, "read:data") ||
		getAccessibleWebsiteIds(apiKey).some((websiteId) =>
			hasWebsiteScope(apiKey, websiteId, "read:data")
		)
	);
}

async function handleMcpRequest({
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
	return await handleDatabuddyMcpRequest({
		request,
		requestHeaders: request.headers,
		userId: user?.id ?? null,
		apiKey,
		organizationId,
	});
}

export const mcp = new Elysia({ name: "mcp" })
	.derive(async ({ request }) => {
		const hasApiKey = isApiKeyPresent(request.headers);
		const apiKey = hasApiKey
			? await getApiKeyFromHeader(request.headers)
			: null;
		const session = hasApiKey
			? null
			: await auth.api.getSession({ headers: request.headers });

		if (hasApiKey && !(apiKey && canReadMcp(apiKey))) {
			return {
				user: null,
				apiKey: null,
				isAuthenticated: false,
				organizationId: null,
			};
		}

		const user = session?.user ?? null;
		return {
			user,
			apiKey,
			isAuthenticated: Boolean(user ?? apiKey),
			organizationId:
				apiKey?.organizationId ?? session?.session.activeOrganizationId ?? null,
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
		async ({ request, user, apiKey, organizationId }) =>
			await handleMcpRequest({ request, user, apiKey, organizationId })
	)
	.all(
		"/v1/mcp/",
		async ({ request, user, apiKey, organizationId }) =>
			await handleMcpRequest({ request, user, apiKey, organizationId })
	)
	.all(
		"/mcp",
		async ({ request, user, apiKey, organizationId }) =>
			await handleMcpRequest({ request, user, apiKey, organizationId })
	)
	.all(
		"/mcp/",
		async ({ request, user, apiKey, organizationId }) =>
			await handleMcpRequest({ request, user, apiKey, organizationId })
	)
	.all(
		"/.well-known/mcp",
		async ({ request, user, apiKey, organizationId }) =>
			await handleMcpRequest({ request, user, apiKey, organizationId })
	);
