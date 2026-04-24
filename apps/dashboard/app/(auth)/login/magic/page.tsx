"use client";

import { Button } from "@/components/ds/button";
import { Field } from "@/components/ds/field";
import { Input } from "@/components/ds/input";
import { Spinner } from "@/components/ds/spinner";
import { Text } from "@/components/ds/text";
import { authClient } from "@databuddy/auth/client";
import {
	ArrowLeftIcon,
	EnvelopeSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { toast } from "sonner";

function MagicLinkPage() {
	const router = useRouter();
	const [callback] = useQueryState(
		"callback",
		parseAsString.withDefault("/websites")
	);
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleMagicLinkLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) {
			toast.error("Please enter your email address");
			return;
		}
		setIsLoading(true);

		await authClient.signIn.magicLink({
			email,
			callbackURL: callback,
			fetchOptions: {
				onSuccess: () => {
					setIsLoading(false);
					toast.success("Magic link sent! Please check your email.");
					router.push(`/login/magic-sent?email=${encodeURIComponent(email)}`);
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
					Sign in with magic link
				</Text>
				<Text tone="muted">No password needed — just use your email</Text>
			</div>

			<div className="space-y-5 px-6">
				<form className="space-y-5" onSubmit={handleMagicLinkLogin}>
					<Field>
						<Field.Label>
							Email<span className="text-primary">*</span>
						</Field.Label>
						<Input
							autoComplete="email"
							name="email"
							onChange={(e) => setEmail(e.target.value)}
							placeholder="Enter your email"
							required
							type="email"
							value={email}
						/>
					</Field>

					<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
						<EnvelopeSimpleIcon
							className="size-4 shrink-0 text-foreground"
							weight="duotone"
						/>
						<Text tone="muted">
							We&apos;ll send a secure link to your email that will sign you in
							instantly — no password needed.
						</Text>
					</div>

					<Button className="w-full" loading={isLoading} type="submit">
						<EnvelopeSimpleIcon className="size-4" weight="duotone" />
						Send magic link
					</Button>
				</form>
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
			<MagicLinkPage />
		</Suspense>
	);
}
