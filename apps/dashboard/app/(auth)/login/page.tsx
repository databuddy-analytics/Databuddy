"use client";

import { signIn } from "@databuddy/auth/client";
import {
	EyeIcon,
	EyeSlashIcon,
	GithubLogoIcon,
	GoogleLogoIcon,
	SparkleIcon,
	SpinnerIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function LoginPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isLoading, setIsLoading] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [lastUsed, setLastUsed] = useState<string | null>(null);

	const defaultCallbackUrl = searchParams.get("callback") || "/websites";

	useEffect(() => {
		setLastUsed(localStorage.getItem("lastUsedLogin"));
	}, []);

	const handleSocialLogin = (provider: "github" | "google") => {
		setIsLoading(true);

		const callbackUrl = searchParams.get("callback");
		const finalCallbackUrl = callbackUrl || defaultCallbackUrl;

		signIn.social({
			provider,
			callbackURL: finalCallbackUrl,
			newUserCallbackURL: "/onboarding",
			fetchOptions: {
				onSuccess: () => {
					localStorage.setItem("lastUsedLogin", provider);
					if (callbackUrl) {
						router.push(callbackUrl);
					}
				},
				onError: () => {
					setIsLoading(false);
					toast.error(
						`${provider === "github" ? "GitHub" : "Google"} login failed. Please try again.`
					);
				},
			},
		});
	};

	const handleEmailPasswordLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!(email && password)) {
			toast.error("Please enter both email and password");
			return;
		}

		setIsLoading(true);

		await signIn.email({
			email,
			password,
			callbackURL: defaultCallbackUrl,
			fetchOptions: {
				onSuccess: () => {
					localStorage.setItem("lastUsedLogin", "email");
					const callbackUrl = searchParams.get("callback");
					if (callbackUrl) {
						router.push(callbackUrl);
					}
				},
				onError: (error) => {
					setIsLoading(false);
					if (
						error?.error?.code === "EMAIL_NOT_VERIFIED" ||
						error?.error?.message?.toLowerCase().includes("not verified")
					) {
						router.push(
							`/login/verification-needed?email=${encodeURIComponent(email)}`
						);
					} else {
						toast.error(
							error?.error?.message ||
								"Login failed. Please check your credentials and try again."
						);
					}
				},
			},
		});

		setIsLoading(false);
	};

	return (
		<>
			<div className="mb-8 space-y-1 px-6 text-left">
				<h1 className="font-medium text-2xl text-foreground">Welcome back</h1>
				<p className="text-muted-foreground text-sm">
					Sign in to your account to continue your journey with Databuddy
				</p>
			</div>
			<div className="relative px-6">
				<div className="relative z-10">
					<div className="space-y-6">
						<div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2">
							<Button
								className="relative w-full"
								disabled={isLoading}
								onClick={() => handleSocialLogin("github")}
								size="lg"
								type="button"
								variant="secondary"
							>
								<GithubLogoIcon className="size-4" />
								Sign in with GitHub
								{lastUsed === "github" && (
									<Badge
										className="-top-3 -right-0.5 absolute z-10 rounded-full px-1 py-0 text-[10px]"
										variant="secondary"
									>
										Last used
									</Badge>
								)}
							</Button>
							<Button
								className="relative w-full"
								disabled={isLoading}
								onClick={() => handleSocialLogin("google")}
								size="lg"
								type="button"
								variant="secondary"
							>
								<GoogleLogoIcon className="size-4" />
								Sign in with Google
								{lastUsed === "google" && (
									<Badge
										className="-top-3 -right-0.5 absolute z-10 rounded-full px-1 py-0 text-[10px]"
										variant="secondary"
									>
										Last used
									</Badge>
								)}
							</Button>
							<div className="relative lg:col-span-2">
								<Button
									asChild
									className="w-full"
									disabled={isLoading}
									size="lg"
									type="button"
									variant="secondary"
								>
									<Link href="/login/magic">
										<SparkleIcon className="size-4" />
										Sign in with Magic Link
									</Link>
								</Button>
								{lastUsed === "magic" && (
									<Badge
										className="-top-3 -right-0.5 absolute z-10 rounded-full px-1 py-0 text-[10px]"
										variant="secondary"
									>
										Last used
									</Badge>
								)}
							</div>
						</div>
						<div className="relative flex w-full items-center justify-center gap-3">
							<Separator className="flex-1 opacity-70" />
							<p className="text-nowrap font-medium text-muted-foreground/50 text-sm">
								Or
							</p>
							<Separator className="flex-1 opacity-70" />
						</div>
						<form className="space-y-5" onSubmit={handleEmailPasswordLogin}>
							<div className="relative space-y-3">
								<Label className="font-medium text-foreground" htmlFor="email">
									Email<span className="text-primary">*</span>
								</Label>
								<Input
									autoComplete="email"
									id="email"
									name="email"
									onChange={(e) => setEmail(e.target.value)}
									placeholder="Enter your email"
									required
									type="email"
									value={email}
								/>
								{lastUsed === "email" && (
									<Badge
										className="-translate-y-1/2 absolute top-5 right-0 rounded-full px-1 py-0 text-[10px]"
										variant="secondary"
									>
										Last used
									</Badge>
								)}
							</div>
							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<Label
										className="font-medium text-foreground"
										htmlFor="password"
									>
										Password<span className="text-primary">*</span>
									</Label>
								</div>
								<div className="relative">
									<Input
										autoComplete="current-password"
										id="password"
										name="password"
										onChange={(e) => setPassword(e.target.value)}
										placeholder="••••••••"
										required
										type={showPassword ? "text" : "password"}
										value={password}
									/>
									<Button
										aria-label={
											showPassword ? "Hide password" : "Show password"
										}
										className="absolute top-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
										onClick={() => setShowPassword(!showPassword)}
										size="sm"
										type="button"
										variant="ghost"
									>
										{showPassword ? (
											<EyeSlashIcon className="size-4" />
										) : (
											<EyeIcon className="size-4" />
										)}
									</Button>
								</div>
							</div>
							<Button className="w-full" disabled={isLoading} type="submit">
								{isLoading ? (
									<>
										<SpinnerIcon className="mr-2 size-4 animate-spin" />
										Signing in...
									</>
								) : (
									"Sign in"
								)}
							</Button>
						</form>
					</div>
				</div>
			</div>
			<div className="mt-5 flex flex-col flex-wrap items-center justify-center gap-4 px-5 text-center lg:flex-row">
				<p className="flex-1 text-[13px] text-muted-foreground lg:text-nowrap">
					Don&apos;t have an account?{" "}
					<Link
						className="font-medium text-accent-foreground duration-200 hover:text-accent-foreground/80"
						href="/register"
					>
						Sign up
					</Link>
				</p>
				<Link
					className="h-auto flex-1 cursor-pointer p-0 text-right text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
					href="/login/forgot"
				>
					Forgot password?
				</Link>
			</div>
		</>
	);
}

export default function Page() {
	return (
		<Suspense
			fallback={
				<div className="flex h-screen items-center justify-center bg-background">
					<div className="relative">
						<div className="absolute inset-0 animate-ping rounded-full bg-primary/20 blur-xl" />
						<SpinnerIcon className="relative size-8 animate-spin text-primary" />
					</div>
				</div>
			}
		>
			<LoginPage />
		</Suspense>
	);
}
