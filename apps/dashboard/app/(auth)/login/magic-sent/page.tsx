"use client";

import { authClient } from "@databuddy/auth/client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, EnvelopeIcon } from "@databuddy/ui/icons";
import { Button, Spinner, Text } from "@databuddy/ui";

const MAGIC_EMAIL_KEY = "databuddy:magic-email";

function MagicSentPage() {
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);

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
			return;
		}
		const stored = sessionStorage.getItem(MAGIC_EMAIL_KEY);
		if (stored) {
			setEmail(stored);
		}
	}, []);

	const handleResend = async (e: React.MouseEvent) => {
		e.preventDefault();
		if (!email) {
			toast.error("No email found");
			return;
		}
		setIsLoading(true);

		await authClient.signIn.magicLink({
			email,
			callbackURL: "/home",
			fetchOptions: {
				onSuccess: () => {
					setIsLoading(false);
					toast.success("Magic link sent! Please check your email.");
				},
				onError: () => {
					setIsLoading(false);
					toast.error("Failed to send magic link. Please try again.");
				},
			},
		});

		setIsLoading(false);
	};

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
					href="/login"
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
