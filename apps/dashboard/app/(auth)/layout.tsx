import { readBooleanEnv } from "@databuddy/env/boolean";
import { connection } from "next/server";
import type { ReactNode } from "react";
import AuthLayout from "./auth-layout";

export default async function Layout({ children }: { children: ReactNode }) {
	if (!readBooleanEnv("SELFHOST")) {
		return <AuthLayout>{children}</AuthLayout>;
	}
	await connection();
	return (
		<AuthLayout
			capabilities={{
				email: Boolean(
					process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()
				),
				github: Boolean(
					process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
				),
				google: Boolean(
					process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
				),
				verifyEmail: readBooleanEnv("REQUIRE_EMAIL_VERIFICATION"),
			}}
		>
			{children}
		</AuthLayout>
	);
}
