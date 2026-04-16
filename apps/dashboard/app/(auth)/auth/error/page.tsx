"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react";
import { ShieldWarningIcon } from "@phosphor-icons/react";
import { SpinnerIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";

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
};

const DEFAULT_ERROR = {
	title: "Authentication error",
	description:
		"Something went wrong during sign in. Please try again or use a different method.",
};

function AuthErrorPage() {
	const [errorCode] = useQueryState("error", parseAsString.withDefault(""));

	const errorInfo = ERROR_MESSAGES[errorCode] ?? DEFAULT_ERROR;

	return (
		<>
			<div className="mb-8 space-y-1 px-6 text-left">
				<h1 className="font-medium text-2xl text-foreground">
					{errorInfo.title}
				</h1>
				<p className="text-muted-foreground text-sm">
					Something went wrong with your request
				</p>
			</div>
			<div className="relative px-6">
				<div className="relative z-10">
					<div className="space-y-5">
						<div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
							<ShieldWarningIcon className="size-5 shrink-0 text-destructive" />
							<p className="text-muted-foreground text-sm">
								{errorInfo.description}
							</p>
						</div>

						{errorCode && (
							<div className="rounded border border-border bg-muted/30 px-3 py-2">
								<p className="font-mono text-muted-foreground text-xs">
									Error: {errorCode}
								</p>
							</div>
						)}

						<Button asChild className="w-full">
							<Link href="/login">Back to login</Link>
						</Button>
					</div>
				</div>
			</div>
			<div className="mt-5 flex flex-col flex-wrap items-center justify-center gap-4 px-5 text-center lg:flex-row">
				<Link
					className="h-auto flex-1 cursor-pointer p-0 text-right text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
					href="/register"
				>
					Create an account instead
				</Link>
				<Link
					className="h-auto flex-1 cursor-pointer p-0 text-right text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
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
				<div className="flex h-dvh items-center justify-center bg-background">
					<div className="relative">
						<div className="absolute inset-0 animate-ping rounded-full bg-primary/20 blur-xl" />
						<SpinnerIcon className="relative size-8 animate-spin text-primary" />
					</div>
				</div>
			}
		>
			<AuthErrorPage />
		</Suspense>
	);
}
