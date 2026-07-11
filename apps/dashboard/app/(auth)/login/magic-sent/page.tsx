"use client";

import { authClient } from "@databuddy/auth/client";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, EnvelopeIcon } from "@databuddy/ui/icons";
import { Button, Spinner, Text } from "@databuddy/ui";

const MAGIC_EMAIL_KEY = "databuddy:magic-email";

function MagicSentPage() {
	const [callback] = useQueryState(
		"callback",
		parseAsString.withDefault("/websites")
	);
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const magicLinkHref = `/login/magic?callback=${encodeURIComponent(callback)}`;
	const loginHref = `/login?callback=${encodeURIComponent(callback)}`;

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const fromQuery = params.get("email");
		if (fromQuery) {
			sessionStorage.setItem(MAGIC_EMAIL_KEY, fromQuery);
			setEmail(fromQuery);
			params.delete("email");
			const next = params.toString();
			window.history.replaceState(
				null,
				"",
				`${window.location.pathname}${next ? `?${next}` : ""}`
			);
			setIsReady(true);
			return;
		}
		const stored = sessionStorage.getItem(MAGIC_EMAIL_KEY);
		if (stored) {
			setEmail(stored);
		}
		setIsReady(true);
	}, []);

	const handleResend = async (e: React.MouseEvent) => {
		e.preventDefault();
		if (!email) {
			toast.error("No email found");
			return;
		}
		setIsLoading(true);

		try {
			const { error } = await authClient.signIn.magicLink({
				email,
				callbackURL: callback,
				errorCallbackURL: `/auth/error?callback=${encodeURIComponent(callback)}`,
			});
			if (error) {
				toast.error("We couldn't send the magic link. Try again in a moment.");
			} else {
				toast.success("Magic link sent. Check your email.");
			}
		} catch {
			toast.error("We couldn't send the magic link. Try again in a moment.");
		}
		setIsLoading(false);
	};

	if (!isReady) {
		return (
			<div className="flex h-40 items-center justify-center">
				<Spinner size="lg" />
			</div>
		);
	}

	if (!email) {
		return (
			<>
				<div className="mb-8 space-y-1.5 px-6">
					<Text as="h1" className="text-balance font-medium text-2xl">
						Request a new magic link
					</Text>
					<Text tone="muted">
						We couldn&apos;t recover the email address for this request.
					</Text>
				</div>
				<div className="px-6">
					<Button asChild className="w-full">
						<Link href={magicLinkHref}>Enter your email again</Link>
					</Button>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="mb-8 space-y-1.5 px-6">
				<Text as="h1" className="text-balance font-medium text-2xl">
					Check your email
				</Text>
				<Text tone="muted">
					Magic link sent to{" "}
					<strong className="font-medium text-primary">{email}</strong>
				</Text>
			</div>

			<div className="space-y-5 px-6">
				<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
					<EnvelopeIcon className="size-5 shrink-0 text-primary" />
					<Text tone="muted">
						We&apos;ve sent a magic link to{" "}
						<strong className="text-foreground">{email}</strong>. Please check
						your inbox and click the link to sign in instantly.
					</Text>
				</div>
				<Button className="w-full" loading={isLoading} onClick={handleResend}>
					Resend magic link
				</Button>
			</div>

			<div className="mt-5 flex items-center justify-center px-6">
				<Link
					className="text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
					href={loginHref}
				>
					<ArrowLeftIcon className="mr-1 inline size-3" />
					Back to login
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
			<MagicSentPage />
		</Suspense>
	);
}
