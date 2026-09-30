import { oauthAuth } from "@databuddy/auth/oauth";

export function GET(request: Request) {
	return oauthAuth.api.getOAuthServerConfig({ request, asResponse: true });
}
