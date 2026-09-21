"use client";

import Link from "next/link";
import { createContext, useContext } from "react";
import { Button, Text } from "@databuddy/ui";

export interface AuthCapabilities {
	email: boolean;
	github: boolean;
	google: boolean;
	verifyEmail: boolean;
}

export const AuthCapabilitiesContext = createContext<AuthCapabilities>({
	email: true,
	github: true,
	google: true,
	verifyEmail: true,
});

export function useAuthCapabilities() {
	return useContext(AuthCapabilitiesContext);
}

export function EmailUnavailable({ loginHref }: { loginHref: string }) {
	return (
		<div className="space-y-5 px-6">
			<Text as="h1" className="text-balance font-medium text-2xl">
				Email isn't set up
			</Text>
			<Text tone="muted">
				Ask your administrator to enable email, or sign in with your password.
			</Text>
			<Button asChild className="w-full">
				<Link href={loginHref}>Back to sign in</Link>
			</Button>
		</div>
	);
}
