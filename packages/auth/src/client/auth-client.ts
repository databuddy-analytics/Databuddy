import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import {
	emailOTPClient,
	lastLoginMethodClient,
	magicLinkClient,
	multiSessionClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, admin, member, owner } from "../permissions";

export const authClient = createAuthClient({
	plugins: [
		oauthProviderClient(),
		twoFactorClient(),
		multiSessionClient(),
		emailOTPClient(),
		magicLinkClient(),
		lastLoginMethodClient(),
		organizationClient({
			ac,
			roles: {
				owner,
				admin,
				member,
			},
		}),
	],
});

export const useSession = authClient.useSession;
