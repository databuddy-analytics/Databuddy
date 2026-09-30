import { oauthAuth } from "@databuddy/auth/oauth";

export function GET(request: Request) {
	return oauthAuth.api.getOpenIdConfig({ request, asResponse: true });
}
