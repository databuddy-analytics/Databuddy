"use client";

import { authClient } from "@databuddy/auth/client";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { safeCallbackPath } from "@/lib/safe-callback";
import { ArrowLeftIcon, WarningIcon } from "@databuddy/ui/icons";
import { Button, Spinner, Text } from "@databuddy/ui";
import {
	readVerificationEmail,
	storeVerificationEmail,
} from "../verification-email-storage";

function VerificationNeededPage() {
	const [callback] = useQueryState(
		"callback",
		parseAsString.withDefault("/websites")
	);
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const safeCallback = safeCallbackPath(callback);
	const loginHref = `/login?callback=${encodeURIComponent(safeCallback)}`;

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const fromQuery = params.get("email");
		if (fromQuery) {
			storeVerificationEmail(fromQuery);
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
		const stored = readVerificationEmail();
		if (stored) {
			setEmail(stored);
		}
		setIsReady(true);
	}, []);

	const sendVerificationEmail = async () => {
		setIsLoading(true);

		try {
			const { error } = await authClient.sendVerificationEmail({
				email,
				callbackURL: safeCallback,
			});
			if (error) {
				toast.error(
					"We couldn't send the verification email. Try again in a moment."
				);
			} else {
				toast.success("Verification email sent. Check your inbox.");
			}
		} catch {
			toast.error(
				"We couldn't send the verification email. Try again in a moment."
			);
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
						Verify your email
					</Text>
					<Text tone="muted">
						Sign in again so we know where to send the verification link.
					</Text>
				</div>
				<div className="px-6">
					<Button asChild className="w-full">
						<Link href={loginHref}>Back to sign in</Link>
					</Button>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="mb-8 space-y-1.5 px-6">
				<Text as="h1" className="text-balance font-medium text-2xl">
					Verify your email
				</Text>
				<Text tone="muted">
					Verification needed for{" "}
					<strong className="font-medium text-primary">{email}</strong>
				</Text>
			</div>

			<div className="space-y-5 px-6">
				<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
					<WarningIcon className="size-5 shrink-0 text-primary" />
					<Text tone="muted">
						Your email <strong className="text-foreground">{email}</strong>{" "}
						needs to be verified before you can sign in. Please check your inbox
						for the verification link.
					</Text>
				</div>
				<Button
					className="w-full"
					disabled={!email}
					loading={isLoading}
					onClick={sendVerificationEmail}
				>
					Resend verification email
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
			<VerificationNeededPage />
		</Suspense>
	);
}
