"use client";

import { authClient } from "@databuddy/auth/client";
import { track } from "@databuddy/sdk";
import {
	CaretLeftIcon,
	EyeIcon,
	EyeSlashIcon,
	GithubLogoIcon,
	GoogleLogoIcon,
	InfoIcon,
	SpinnerIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import VisuallyHidden from "@/components/ui/visuallyhidden";

function RegisterPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const selectedPlan = searchParams.get("plan");
	const callbackUrl = searchParams.get("callback");
	const [isLoading, setIsLoading] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		password: "",
		confirmPassword: "",
	});
	const [acceptTerms, setAcceptTerms] = useState(false);
	const [isHoneypot, setIsHoneypot] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [registrationStep, setRegistrationStep] = useState<
		"form" | "success" | "verification-needed"
	>("form");

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const trackSignUp = async (
		method: "email" | "social",
		provider?: "github" | "google"
	) => {
		try {
			await track("signup_completed", {
				method: method === "social" ? `${method}_${provider}` : method,
				plan: selectedPlan || undefined,
			});
		} catch (error) {
			console.error("Failed to track sign up event:", error);
		}
	};

	const handleAuthSuccess = () => {
		if (callbackUrl) {
			toast.success("Account created! Completing integration...");
			router.push(callbackUrl);
		} else if (selectedPlan) {
			localStorage.setItem("pendingPlanSelection", selectedPlan);
			router.push(`/billing?tab=plans&plan=${selectedPlan}`);
		} else {
			router.push("/websites");
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (formData.password !== formData.confirmPassword) {
			toast.error("Passwords do not match");
			return;
		}

		if (!acceptTerms) {
			toast.error("You must accept the terms and conditions");
			return;
		}

		if (isHoneypot) {
			toast.error("Server error, please try again later");
			return;
		}

		setIsLoading(true);

		const { error } = await authClient.signUp.email({
			email: formData.email,
			password: formData.password,
			name: formData.name,
			fetchOptions: {
				onSuccess: () => {
					trackSignUp("email").catch(console.error);
					if (callbackUrl) {
						handleAuthSuccess();
					} else {
						toast.success(
							"Account created! Please check your email to verify your account."
						);
						setRegistrationStep("verification-needed");
						if (selectedPlan) {
							localStorage.setItem("pendingPlanSelection", selectedPlan);
						}
					}
				},
			},
		});

		if (error) {
			toast.error(error.message || "Failed to create account");
		}

		setIsLoading(false);
	};

	const resendVerificationEmail = async () => {
		setIsLoading(true);

		await authClient.sendVerificationEmail({
			email: formData.email,
			callbackURL: "/onboarding",
			fetchOptions: {
				onSuccess: () => {
					toast.success("Verification email sent!");
				},
				onError: () => {
					toast.error(
						"Failed to send verification email. Please try again later."
					);
				},
			},
		});

		setIsLoading(false);
	};

	const handleSocialLogin = async (provider: "github" | "google") => {
		setIsLoading(true);

		try {
			await authClient.signIn.social({
				provider,
				callbackURL: callbackUrl || "/websites",
				fetchOptions: {
					onSuccess: () => {
						trackSignUp("social", provider).catch(console.error);
						toast.success("Registration successful!");
						handleAuthSuccess();
					},
					onError: () => {
						toast.error(
							`${provider === "github" ? "GitHub" : "Google"} login failed. Please try again.`
						);
						setIsLoading(false);
					},
				},
			});
		} catch (_error) {
			toast.error("Login failed. Please try again.");
			setIsLoading(false);
		}
	};

	// Render header content based on current registration step
	const renderHeaderContent = () => {
		switch (registrationStep) {
			case "verification-needed":
				return (
					<>
						<h1 className="font-medium text-2xl text-foreground">
							Verify your email
						</h1>
						<p className="mt-2 text-muted-foreground text-sm">
							Please check your email:{" "}
							<span className="font-medium text-accent-foreground">
								{formData.email}
							</span>{" "}
							and click the verification link to activate your account. If you
							don't see the email, check your spam folder.
						</p>
					</>
				);
			case "success":
				return (
					<>
						<h1 className="font-medium text-2xl text-foreground">Success!</h1>
						<p className="mt-1 text-muted-foreground text-sm">
							Your account has been created successfully. You can now sign in to
							access your dashboard.
						</p>
					</>
				);
			default:
				return (
					<>
						<h1 className="font-medium text-2xl text-foreground tracking-tight">
							Create your account
						</h1>
						<p className="mt-1 text-muted-foreground text-sm">
							Sign up to start building better products with Databuddy
						</p>
					</>
				);
		}
	};

	// Split render content into smaller components
	const renderVerificationContent = () => (
		<div className="space-y-5">
			<div className="flex flex-col space-y-3">
				<Button
					className="w-full"
					disabled={isLoading}
					onClick={resendVerificationEmail}
					size="lg"
				>
					{isLoading ? (
						<>
							<SpinnerIcon className="mr-2 size-4 animate-spin" />
							Sending...
						</>
					) : (
						<>
							<span className="hidden sm:inline">
								Resend verification email
							</span>
							<span className="sm:hidden">Resend email</span>
						</>
					)}
				</Button>

				<Button
					onClick={() => setRegistrationStep("form")}
					size="lg"
					variant="ghost"
				>
					<CaretLeftIcon className="size-3" weight="bold" />
					<span className="hidden sm:inline">Back to registration</span>
					<span className="sm:hidden">Back</span>
				</Button>
			</div>
		</div>
	);

	const renderSuccessContent = () => (
		<div className="space-y-5">
			<Button
				className="w-full"
				onClick={() => router.push("/login")}
				size="lg"
			>
				<span className="hidden sm:inline">Continue to login</span>
				<span className="sm:hidden">Continue</span>
			</Button>
		</div>
	);

	const renderFormContent = () => (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<Button
					disabled={isLoading}
					onClick={() => handleSocialLogin("github")}
					size="lg"
					type="button"
					variant="secondary"
				>
					<GithubLogoIcon className="size-4" />
					Sign up with GitHub
				</Button>

				<Button
					disabled={isLoading}
					onClick={() => handleSocialLogin("google")}
					size="lg"
					type="button"
					variant="secondary"
				>
					<GoogleLogoIcon className="size-4" />
					Sign up with Google
				</Button>
			</div>

			<div className="relative">
				<div className="relative flex items-center justify-center gap-3">
					<Separator className="flex-1 opacity-70" />
					<p className="text-nowrap font-medium text-muted-foreground/50 text-sm">
						Or
					</p>
					<Separator className="flex-1 opacity-70" />
				</div>
			</div>

			<form className="space-y-5" onSubmit={handleSubmit}>
				<div className="space-y-3">
					<Label className="font-medium text-foreground" htmlFor="name">
						Full name<span className="text-primary">*</span>
					</Label>
					<Input
						autoComplete="name"
						disabled={isLoading}
						id="name"
						name="name"
						onChange={handleChange}
						placeholder="Enter your name"
						required
						type="text"
						value={formData.name}
					/>
				</div>

				<div className="space-y-3">
					<Label className="font-medium text-foreground" htmlFor="email">
						Email address<span className="text-primary">*</span>
					</Label>
					<Input
						autoComplete="email"
						disabled={isLoading}
						id="email"
						name="email"
						onChange={handleChange}
						placeholder="Enter your email"
						required
						type="email"
						value={formData.email}
					/>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<Label className="font-medium text-foreground" htmlFor="password">
								Password<span className="text-primary">*</span>
							</Label>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<InfoIcon className="size-4 text-muted-foreground" />
									</TooltipTrigger>
									<TooltipContent>
										<p>Password must be at</p>
										<p>least 8 characters long</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
						<div className="relative">
							<Input
								autoComplete="new-password"
								disabled={isLoading}
								id="password"
								minLength={8}
								name="password"
								onChange={handleChange}
								placeholder="••••••••"
								required
								type={showPassword ? "text" : "password"}
								value={formData.password}
							/>
							<Button
								aria-label={showPassword ? "Hide password" : "Show password"}
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

					<div className="space-y-3">
						<Label
							className="whitespace-nowrap font-medium text-foreground"
							htmlFor="confirmPassword"
						>
							Confirm password<span className="text-primary">*</span>
						</Label>
						<div className="relative">
							<Input
								autoComplete="new-password"
								disabled={isLoading}
								id="confirmPassword"
								minLength={8}
								name="confirmPassword"
								onChange={handleChange}
								placeholder="••••••••"
								required
								type={showConfirmPassword ? "text" : "password"}
								value={formData.confirmPassword}
							/>
							<Button
								aria-label={
									showConfirmPassword ? "Hide password" : "Show password"
								}
								className="absolute top-0 right-0 h-full px-3 text-muted-foreground hover:bg-transparent"
								onClick={() => setShowConfirmPassword(!showConfirmPassword)}
								size="sm"
								type="button"
								variant="ghost"
							>
								{showConfirmPassword ? (
									<EyeSlashIcon className="size-4" />
								) : (
									<EyeIcon className="size-4" />
								)}
							</Button>
						</div>
					</div>
				</div>

				<VisuallyHidden>
					<div className="flex items-center space-x-2" id="honeypot">
						<Checkbox
							checked={isHoneypot}
							disabled={isLoading}
							id="honeypot"
							onCheckedChange={(checked) => setIsHoneypot(checked as boolean)}
						/>
					</div>
				</VisuallyHidden>

				<div className="space-y-3">
					<div className="flex items-start gap-2">
						<Checkbox
							checked={acceptTerms}
							className="mt-1 cursor-pointer data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
							disabled={isLoading}
							id="terms"
							onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
						/>
						<Label
							className="text-[13px] text-muted-foreground leading-relaxed"
							htmlFor="terms"
						>
							<span className="hidden sm:inline">
								I agree to the{" "}
								<Link
									className="font-medium text-accent-foreground duration-200 hover:text-accent-foreground/80"
									href="https://www.databuddy.cc/terms"
									target="_blank"
								>
									Terms of Service
								</Link>{" "}
								and{" "}
								<Link
									className="font-medium text-accent-foreground duration-200 hover:text-accent-foreground/80"
									href="https://www.databuddy.cc/privacy"
									target="_blank"
								>
									Privacy Policy
								</Link>
							</span>
							<span className="sm:hidden">
								I agree to{" "}
								<Link
									className="font-medium text-primary hover:text-primary/80"
									href="https://www.databuddy.cc/terms"
									target="_blank"
								>
									Terms
								</Link>{" "}
								&{" "}
								<Link
									className="font-medium text-primary hover:text-primary/80"
									href="https://www.databuddy.cc/privacy"
									target="_blank"
								>
									Privacy
								</Link>
							</span>
						</Label>
					</div>
				</div>

				<Button
					className="relative mt-4 w-full"
					disabled={isLoading}
					size="lg"
					type="submit"
				>
					{isLoading ? (
						<>
							<SpinnerIcon className="mr-2 size-4 animate-spin" />
							<span className="hidden sm:inline">Creating account...</span>
							<span className="sm:hidden">Creating...</span>
						</>
					) : (
						<>
							<span className="hidden sm:inline">Create account</span>
							<span className="sm:hidden">Sign up</span>
						</>
					)}
				</Button>
			</form>
		</div>
	);

	// Render content based on current registration step
	const renderContent = () => {
		switch (registrationStep) {
			case "verification-needed":
				return renderVerificationContent();
			case "success":
				return renderSuccessContent();
			default:
				return renderFormContent();
		}
	};

	return (
		<>
			<div className="mb-8 px-6 text-left">{renderHeaderContent()}</div>
			<div className="relative overflow-hidden px-6">
				<div className="relative z-10">{renderContent()}</div>
			</div>
			{registrationStep === "form" && (
				<div className="mt-4 text-center">
					<p className="text-muted-foreground text-sm">
						Already have an account?{" "}
						<Link
							className="h-auto flex-1 cursor-pointer p-0 text-right font-medium text-[13px] text-accent-foreground duration-200 hover:text-accent-foreground/60"
							href={
								callbackUrl
									? `/login?callback=${encodeURIComponent(callbackUrl)}`
									: "/login"
							}
						>
							Sign in
						</Link>
					</p>
				</div>
			)}
		</>
	);
}

export default function RegisterPage() {
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
			<RegisterPageContent />
		</Suspense>
	);
}
