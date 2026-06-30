"use client";

import { authClient } from "@databuddy/auth/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { GithubMark, GoogleMark } from "@/components/ui/brand-icons";
import { EnvelopeSimpleIcon, EyeIcon, EyeSlashIcon } from "@databuddy/ui/icons";
import {
	Badge,
	Button,
	Divider,
	Field,
	Input,
	Spinner,
	Text,
	useHydrated,
} from "@databuddy/ui";
import { storeVerificationEmail } from "./verification-email-storage";

function LoginPage() {
	const router = useRouter();
	const [callback] = useQueryState(
		"callback",
		parseAsString.withDefault("/websites")
	);
	const [isLoading, setIsLoading] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const isHydrated = useHydrated();

	const lastUsed = isHydrated ? authClient.getLastUsedLoginMethod() : null;

	const getProviderLabel = (provider: "github" | "google") =>
		provider === "github" ? "GitHub" : "Google";

	const handleSocialLogin = async (provider: "github" | "google") => {
		setIsLoading(true);

		try {
			const result = await authClient.signIn.social({
				provider,
				callbackURL: callback,
				newUserCallbackURL: "/onboarding",
				disableRedirect: true,
			});

			if (result.error) {
				toast.error(
					result.error.message ||
						`${getProviderLabel(provider)} login failed. Please try again.`
				);
				setIsLoading(false);
				return;
			}

			if (result.data?.url) {
				window.location.href = result.data.url;
				return;
			}

			toast.error(
				`${getProviderLabel(provider)} login failed. Please try again.`
			);
			setIsLoading(false);
		} catch {
			toast.error(
				`${getProviderLabel(provider)} login failed. Please try again.`
			);
			setIsLoading(false);
		}
	};

	const handleEmailPasswordLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!(email && password)) {
			toast.error("Please enter both email and password");
			return;
		}

		setIsLoading(true);

		await authClient.signIn.email({
			email,
			password,
			callbackURL: callback,
			fetchOptions: {
				onError: (error) => {
					setIsLoading(false);
					if (
						error?.error?.code === "EMAIL_NOT_VERIFIED" ||
						error?.error?.message?.toLowerCase().includes("not verified")
					) {
						storeVerificationEmail(email);
						router.push("/login/verification-needed");
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
			<div className="mb-8 space-y-1.5 px-6">
				<Text as="h1" className="text-balance font-medium text-2xl">
					Welcome back
				</Text>
				<Text tone="muted">
					Sign in to your account to continue your journey with Databuddy
				</Text>
			</div>

			<div className="space-y-6 px-6">
				<div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2">
					<Button
						className="relative w-full"
						disabled={isLoading}
						onClick={() => handleSocialLogin("github")}
						size="lg"
						variant="outline"
					>
						<GithubMark className="size-4" />
						Sign in with GitHub
						{lastUsed === "github" && (
							<Badge
								className="absolute -top-3 -right-0.5 z-10 rounded-full px-1 py-0 text-[10px]"
								variant="muted"
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
						variant="outline"
					>
						<GoogleMark className="size-4" />
						Sign in with Google
						{lastUsed === "google" && (
							<Badge
								className="absolute -top-3 -right-0.5 z-10 rounded-full px-1 py-0 text-[10px]"
								variant="muted"
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
							variant="outline"
						>
							<Link href="/login/magic">
								<EnvelopeSimpleIcon className="size-4" weight="duotone" />
								Sign in with Magic Link
							</Link>
						</Button>
						{lastUsed === "magic-link" && (
							<Badge
								className="absolute -top-3 -right-0.5 z-10 rounded-full px-1 py-0 text-[10px]"
								variant="muted"
							>
								Last used
							</Badge>
						)}
					</div>
				</div>

				<div className="flex items-center gap-3">
					<Divider className="flex-1 opacity-70" />
					<Text
						className="text-nowrap text-muted-foreground/50"
						variant="label"
					>
						Or
					</Text>
					<Divider className="flex-1 opacity-70" />
				</div>

				<form className="space-y-5" onSubmit={handleEmailPasswordLogin}>
					<Field className="relative">
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
						{lastUsed === "email" && (
							<Badge
								className="absolute top-0 right-0 rounded-full px-1 py-0 text-[10px]"
								variant="muted"
							>
								Last used
							</Badge>
						)}
					</Field>

					<Field>
						<Field.Label>
							Password<span className="text-primary">*</span>
						</Field.Label>
						<div className="relative">
							<Input
								autoComplete="current-password"
								name="password"
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								required
								type={showPassword ? "text" : "password"}
								value={password}
							/>
							<Button
								aria-label={showPassword ? "Hide password" : "Show password"}
								className="absolute top-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
								onClick={() => setShowPassword(!showPassword)}
								size="sm"
								variant="ghost"
							>
								{showPassword ? (
									<EyeSlashIcon className="size-4" />
								) : (
									<EyeIcon className="size-4" />
								)}
							</Button>
						</div>
					</Field>

					<Button className="w-full" loading={isLoading} type="submit">
						Sign in
					</Button>
				</form>
			</div>

			<div className="mt-5 flex flex-wrap items-center justify-center gap-4 px-6 text-center">
				<Text className="flex-1 lg:text-nowrap" tone="muted" variant="caption">
					Don&apos;t have an account?{" "}
					<Link
						className="font-medium text-accent-foreground duration-200 hover:text-accent-foreground/80"
						href="/register"
					>
						Sign up
					</Link>
				</Text>
				<Link
					className="flex-1 text-right text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
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
				<div className="flex h-40 items-center justify-center">
					<Spinner size="lg" />
				</div>
			}
		>
			<LoginPage />
		</Suspense>
	);
}
