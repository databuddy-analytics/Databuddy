"use client";

import { authClient } from "@databuddy/auth/client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, WarningIcon } from "@databuddy/ui/icons";
import { Button, Spinner, Text } from "@databuddy/ui";
import {
	readVerificationEmail,
	storeVerificationEmail,
} from "../verification-email-storage";

function VerificationNeededPage() {
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);

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
			return;
		}
		const stored = readVerificationEmail();
		if (stored) {
			setEmail(stored);
		}
	}, []);

	const sendVerificationEmail = async () => {
		setIsLoading(true);

		await authClient.sendVerificationEmail({
			email,
			callbackURL: "/home",
			fetchOptions: {
				onSuccess: () => {
					toast.success("Verification email sent!");
					setIsLoading(false);
				},
				onError: () => {
					setIsLoading(false);
					toast.error(
						"Failed to send verification email. Please try again later."
					);
				},
			},
		});

		setIsLoading(false);
	};

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
			<VerificationNeededPage />
		</Suspense>
	);
}
