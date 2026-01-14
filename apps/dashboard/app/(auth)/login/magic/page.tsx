"use client";

import { authClient } from "@databuddy/auth/client";
import { ArrowLeftIcon, SparkleIcon, SpinnerIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
			<div className="mb-8 space-y-1 px-6 text-left">
				<h1 className="font-medium text-2xl text-foreground">
					Sign in with magic link
				</h1>
				<p className="text-muted-foreground text-sm">
					No password needed — just use your email
				</p>
			</div>
			<div className="relative px-6">
				<div className="relative z-10">
					<form className="space-y-5" onSubmit={handleMagicLinkLogin}>
						<div className="space-y-3">
							<Label
								className="font-medium text-foreground"
								htmlFor="magic-email"
							>
								Email<span className="text-primary">*</span>
							</Label>
							<Input
								autoComplete="email"
								id="magic-email"
								name="email"
								onChange={(e) => setEmail(e.target.value)}
								placeholder="Enter your email"
								required
								type="email"
								value={email}
							/>
						</div>
						<div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
							<SparkleIcon className="size-4 shrink-0 text-foreground" />
							<p className="text-muted-foreground">
								We&apos;ll send a secure link to your email that will sign you
								in instantly — no password needed.
							</p>
						</div>
						<Button className="w-full" disabled={isLoading} type="submit">
							{isLoading ? (
								<>
									<SpinnerIcon className="mr-2 size-4 animate-spin" />
									Sending magic link...
								</>
							) : (
								<>
									<SparkleIcon className="mr-2 size-4" />
									Send magic link
								</>
							)}
						</Button>
					</form>
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
			<MagicLinkPage />
		</Suspense>
	);
}
