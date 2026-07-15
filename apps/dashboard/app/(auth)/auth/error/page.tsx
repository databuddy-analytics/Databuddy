"use client";

import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense } from "react";
import { safeCallbackPath } from "@/lib/safe-callback";
import { ArrowLeftIcon, ShieldWarningIcon } from "@databuddy/ui/icons";
import { Button, Spinner, Text } from "@databuddy/ui";

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
	account_already_linked_to_different_user: {
		title: "Account already linked",
		description:
			"This social account is already connected to a different user. Please sign in with the original account first, unlink it, then try again.",
	},
	unable_to_link_account: {
		title: "Unable to link account",
		description:
			"We couldn't link this account. The email may not be verified by the provider, or the account may already exist.",
	},
	unable_to_get_user_info: {
		title: "Provider error",
		description:
			"We couldn't retrieve your information from the sign-in provider. Please try again.",
	},
	"email_doesn't_match": {
		title: "Email mismatch",
		description:
			"The email from this provider doesn't match your account. Try signing in with the correct provider.",
	},
	email_not_found: {
		title: "Email not found",
		description:
			"No account was found with this email address. Please sign up first.",
	},
	oauth_provider_not_found: {
		title: "Provider not available",
		description:
			"This sign-in provider is not configured. Please use a different method.",
	},
	signup_disabled: {
		title: "Sign up disabled",
		description:
			"New account registration is currently disabled. Please contact support if you need access.",
	},
	no_callback_url: {
		title: "Missing callback",
		description:
			"The sign-in flow was interrupted due to a missing callback URL. Please try again.",
	},
	no_code: {
		title: "Authorization failed",
		description:
			"No authorization code was received from the provider. Please try signing in again.",
	},
	state_mismatch: {
		title: "Security check failed",
		description:
			"The sign-in request couldn't be verified. This can happen if the request expired. Please try again.",
	},
	state_not_found: {
		title: "Session expired",
		description:
			"Your sign-in session has expired. Please start the sign-in process again.",
	},
	invalid_callback_request: {
		title: "Invalid request",
		description:
			"The callback request was invalid. Please try signing in again.",
	},
	expired_token: {
		title: "Magic link expired",
		description:
			"This magic link has expired. Request a new link to continue signing in.",
	},
	invalid_token: {
		title: "Magic link no longer works",
		description:
			"This magic link is invalid or has already been used. Request a new link to continue.",
	},
};

const DEFAULT_ERROR = {
	title: "Authentication error",
	description:
		"Something went wrong during sign in. Please try again or use a different method.",
};

function AuthErrorPage() {
	const [errorCode] = useQueryState("error", parseAsString.withDefault(""));
	const [callback] = useQueryState(
		"callback",
		parseAsString.withDefault("/websites")
	);
	const safeCallback = safeCallbackPath(callback);

	const errorInfo =
		ERROR_MESSAGES[errorCode] ??
		ERROR_MESSAGES[errorCode.toLowerCase()] ??
		DEFAULT_ERROR;
	const isMagicLinkError = ["expired_token", "invalid_token"].includes(
		errorCode.toLowerCase()
	);
	const recoveryHref = isMagicLinkError
		? `/login/magic?callback=${encodeURIComponent(safeCallback)}`
		: `/login?callback=${encodeURIComponent(safeCallback)}`;

	return (
		<>
			<div className="mb-8 space-y-1.5 px-6">
				<Text as="h1" className="text-balance font-medium text-2xl">
					{errorInfo.title}
				</Text>
				<Text tone="muted">Something went wrong with your request</Text>
			</div>

			<div className="space-y-5 px-6">
				<div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
					<ShieldWarningIcon className="size-5 shrink-0 text-destructive" />
					<Text tone="muted">{errorInfo.description}</Text>
				</div>

				<Button asChild className="w-full">
					<Link href={recoveryHref}>
						{isMagicLinkError ? "Request a new magic link" : "Back to login"}
					</Link>
				</Button>
			</div>

			<div className="mt-5 flex flex-wrap items-center justify-center gap-4 px-6">
				<Link
					className="text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
					href="/register"
				>
					Create an account instead
				</Link>
				<Link
					className="text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
					href="https://www.databuddy.cc"
				>
					<ArrowLeftIcon className="mr-1 inline size-3" />
					Back to databuddy.cc
				</Link>
			</div>
		</>
	);
}

export default function Page() {
	return (
		<Suspense
			fallback={
				<div className="flex h-40 items-center justify-center">
					<Spinner size="lg" />
				</div>
			}
		>
			<AuthErrorPage />
		</Suspense>
	);
}
