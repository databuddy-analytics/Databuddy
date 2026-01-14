"use client";

import { authClient } from "@databuddy/auth/client";
import { ArrowLeftIcon, SpinnerIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function VerificationNeededPage() {
	const [email] = useQueryState("email", parseAsString.withDefault(""));
	const [isLoading, setIsLoading] = useState(false);

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
			<div className="mb-8 space-y-1 px-6 text-left">
				<h1 className="font-medium text-2xl text-foreground">
					Verify your email
				</h1>
				<p className="text-muted-foreground text-sm">
					Verification needed for{" "}
					<strong className="font-medium text-primary">{email}</strong>
				</p>
			</div>
			<div className="relative px-6">
				<div className="relative z-10">
					<div className="space-y-5">
						<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
							<WarningIcon className="size-5 shrink-0 text-primary" />
							<p className="text-muted-foreground text-sm">
								Your email <strong className="text-foreground">{email}</strong>{" "}
								needs to be verified before you can sign in. Please check your
								inbox for the verification link.
							</p>
						</div>
						<Button
							className="w-full"
							disabled={isLoading}
							onClick={sendVerificationEmail}
							type="button"
						>
							{isLoading ? (
								<>
									<SpinnerIcon className="mr-2 size-4 animate-spin" />
									Sending...
								</>
							) : (
								"Resend verification email"
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
			<VerificationNeededPage />
		</Suspense>
	);
}
