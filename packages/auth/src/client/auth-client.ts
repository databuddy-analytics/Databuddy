import {
	customSessionClient,
	emailOTPClient,
	genericOAuthClient,
	magicLinkClient,
	multiSessionClient,
	organizationClient,
	twoFactorClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { auth } from '../auth';
import { ac, admin, member, owner } from '../permissions';

export type AuthClientConfig = {
	baseURL?: string;
	debug?: boolean;
};

const defaultConfig: AuthClientConfig = {
	baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL as string,
	debug: process.env.NODE_ENV !== 'production',
};

export const authClient = createAuthClient({
	baseURL: defaultConfig.baseURL,
	plugins: [
		customSessionClient<typeof auth>(),
		twoFactorClient(),
		multiSessionClient(),
		genericOAuthClient(),
		emailOTPClient(),
		magicLinkClient(),
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

const signIn = authClient.signIn;
const signUp = authClient.signUp;
const signOut = authClient.signOut;
const useSession = authClient.useSession;
const getSession = authClient.getSession;

export { signIn, signUp, signOut, useSession, getSession };
