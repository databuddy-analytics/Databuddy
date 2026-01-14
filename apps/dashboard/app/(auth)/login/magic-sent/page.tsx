"use client";

import { authClient } from "@databuddy/auth/client";
import {
	ArrowLeftIcon,
	EnvelopeIcon,
	SpinnerIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function MagicSentPage() {
	const [email] = useQueryState("email", parseAsString.withDefault(""));
	const [isLoading, setIsLoading] = useState(false);

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
			<div className="mb-8 space-y-1 px-6 text-left">
				<h1 className="font-medium text-2xl text-foreground">
					Check your email
				</h1>
				<p className="text-muted-foreground text-sm">
					Magic link sent to{" "}
					<strong className="font-medium text-primary">{email}</strong>
				</p>
			</div>
			<div className="relative px-6">
				<div className="relative z-10">
					<div className="space-y-5">
						<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
							<EnvelopeIcon className="size-5 shrink-0 text-primary" />
							<p className="text-muted-foreground text-sm">
								We&apos;ve sent a magic link to{" "}
								<strong className="text-foreground">{email}</strong>. Please
								check your inbox and click the link to sign in instantly.
							</p>
						</div>
						<Button
							className="w-full"
							disabled={isLoading}
							onClick={handleResend}
							type="button"
						>
							{isLoading ? (
								<>
									<SpinnerIcon className="mr-2 size-4 animate-spin" />
									Sending...
								</>
							) : (
								"Resend magic link"
							)}
						</Button>
					</div>
				</div>
			</div>
			<div className="mt-5 flex flex-col flex-wrap items-center justify-center gap-4 px-5 text-center lg:flex-row">
				<Link
					className="h-auto flex-1 cursor-pointer p-0 text-right text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
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
				<div className="flex h-dvh items-center justify-center bg-background">
					<div className="relative">
						<div className="absolute inset-0 animate-ping rounded-full bg-primary/20 blur-xl" />
						<SpinnerIcon className="relative size-8 animate-spin text-primary" />
					</div>
				</div>
			}
		>
			<MagicSentPage />
		</Suspense>
	);
}
