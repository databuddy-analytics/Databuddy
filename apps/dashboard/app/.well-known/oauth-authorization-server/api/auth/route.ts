import { mcpOAuthEnabled, oauthAuth } from "@databuddy/auth/oauth";

export function GET(request: Request) {
	if (!mcpOAuthEnabled) {
		return new Response(null, { status: 404 });
	}
	return oauthAuth.api.getOAuthServerConfig({ request, asResponse: true });
}
