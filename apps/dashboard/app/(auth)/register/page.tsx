"use client";

import { authClient } from "@databuddy/auth/client";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { trackOpenAiRegistrationCompleted } from "@/components/openai-ads-pixel";
import { GithubMark, GoogleMark } from "@/components/ui/brand-icons";
import VisuallyHidden from "@/components/ui/visuallyhidden";
import {
	APP_EVENTS,
	readMarketingProperties,
	storePendingSocialSignup,
	type SignupEventProperties,
	type SignupMethod,
	trackAppEvent,
} from "@/lib/app-events";
import {
	CaretLeftIcon,
	EyeIcon,
	EyeSlashIcon,
	InfoIcon,
} from "@databuddy/ui/icons";
import {
	Button,
	Divider,
	Field,
	Input,
	Spinner,
	Text,
	Tooltip,
} from "@databuddy/ui";

function RegisterPageContent() {
	const [selectedPlan] = useQueryState("plan", parseAsString);
	const [callback] = useQueryState(
		"callback",
		parseAsString.withDefault("/websites")
	);
	const [isLoading, setIsLoading] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		password: "",
		confirmPassword: "",
	});
	const [isHoneypot, setIsHoneypot] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [registrationStep, setRegistrationStep] = useState<
		"form" | "verification-needed"
	>("form");

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({ ...prev, [name]: value }));
	};

	const getSignupProperties = (
		method: SignupMethod
	): SignupEventProperties => ({
		...readMarketingProperties(new URLSearchParams(window.location.search)),
		method,
		plan: selectedPlan || undefined,
	});

	const trackSignup = (
		eventName:
			| typeof APP_EVENTS.signupCompleted
			| typeof APP_EVENTS.signupStarted,
		properties: SignupEventProperties
	) => {
		trackAppEvent(eventName, properties, { flush: true });
	};

	const getCallbackUrl = () => {
		if (selectedPlan) {
			localStorage.setItem("pendingPlanSelection", selectedPlan);
			return `/billing/plans?plan=${selectedPlan}`;
		}
		return callback;
	};

	const getProviderLabel = (provider: "github" | "google") =>
		provider === "github" ? "GitHub" : "Google";

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (formData.password !== formData.confirmPassword) {
			toast.error("Passwords do not match");
			return;
		}

		if (isHoneypot) {
			toast.error("Server error, please try again later");
			return;
		}

		setIsLoading(true);
		const signupProperties = getSignupProperties("email");
		trackSignup(APP_EVENTS.signupStarted, signupProperties);

		const { error } = await authClient.signUp.email({
			email: formData.email,
			password: formData.password,
			name: formData.name,
			callbackURL: getCallbackUrl(),
			fetchOptions: {
				onSuccess: () => {
					trackSignup(APP_EVENTS.signupCompleted, signupProperties);
					trackOpenAiRegistrationCompleted({
						email: formData.email,
						properties: signupProperties,
					});
					toast.success(
						"Account created! Please check your email to verify your account."
					);
					setRegistrationStep("verification-needed");
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

		try {
			const { error } = await authClient.sendVerificationEmail({
				email: formData.email,
				callbackURL: getCallbackUrl(),
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

	const handleSocialLogin = async (provider: "github" | "google") => {
		setIsLoading(true);
		const signupProperties = getSignupProperties(`social_${provider}`);
		const callbackURL = getCallbackUrl();
		trackSignup(APP_EVENTS.signupStarted, signupProperties);

		try {
			const result = await authClient.signIn.social({
				provider,
				callbackURL,
				newUserCallbackURL:
					callbackURL === "/websites" ? "/onboarding" : callbackURL,
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
				storePendingSocialSignup(signupProperties);
				window.location.href = result.data.url;
				return;
			}

			toast.error(
				`${getProviderLabel(provider)} login failed. Please try again.`
			);
			setIsLoading(false);
		} catch {
			toast.error("Login failed. Please try again.");
			setIsLoading(false);
		}
	};

	const renderHeaderContent = () => {
		switch (registrationStep) {
			case "verification-needed":
				return (
					<>
						<Text as="h1" className="text-balance font-medium text-2xl">
							Verify your email
						</Text>
						<Text tone="muted">
							Please check your email:{" "}
							<span className="font-medium text-accent-foreground">
								{formData.email}
							</span>{" "}
							and click the verification link to activate your account. If you
							don't see the email, check your spam folder.
						</Text>
					</>
				);
			default:
				return (
					<>
						<Text as="h1" className="text-balance font-medium text-2xl">
							Create your account
						</Text>
						<Text tone="muted">
							Sign up to start building better products with Databuddy
						</Text>
					</>
				);
		}
	};

	const renderVerificationContent = () => (
		<div className="flex flex-col gap-3">
			<Button
				className="w-full"
				loading={isLoading}
				onClick={resendVerificationEmail}
				size="lg"
			>
				<span className="hidden sm:inline">Resend verification email</span>
				<span className="sm:hidden">Resend email</span>
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
	);

	const renderFormContent = () => (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<Button
					disabled={isLoading}
					onClick={() => handleSocialLogin("github")}
					size="lg"
					variant="outline"
				>
					<GithubMark className="size-4" />
					Sign up with GitHub
				</Button>
				<Button
					disabled={isLoading}
					onClick={() => handleSocialLogin("google")}
					size="lg"
					variant="outline"
				>
					<GoogleMark className="size-4" />
					Sign up with Google
				</Button>
			</div>

			<div className="flex items-center gap-3">
				<Divider className="flex-1 opacity-70" />
				<Text className="text-nowrap text-muted-foreground/50" variant="label">
					Or
				</Text>
				<Divider className="flex-1 opacity-70" />
			</div>

			<form className="space-y-5" onSubmit={handleSubmit}>
				<Field>
					<Field.Label>
						Full name<span className="text-primary">*</span>
					</Field.Label>
					<Input
						autoComplete="name"
						disabled={isLoading}
						name="name"
						onChange={handleChange}
						placeholder="Enter your name"
						required
						type="text"
						value={formData.name}
					/>
				</Field>

				<Field>
					<Field.Label>
						Email address<span className="text-primary">*</span>
					</Field.Label>
					<Input
						autoComplete="username email"
						disabled={isLoading}
						name="email"
						onChange={handleChange}
						placeholder="Enter your email"
						required
						type="email"
						value={formData.email}
					/>
				</Field>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field>
						<div className="flex items-center gap-2">
							<Field.Label>
								Password<span className="text-primary">*</span>
							</Field.Label>
							<Tooltip
								content={
									<>
										<p>Password must be at</p>
										<p>least 8 characters long</p>
									</>
								}
							>
								<InfoIcon className="size-4 text-muted-foreground" />
							</Tooltip>
						</div>
						<div className="relative">
							<Input
								autoComplete="new-password"
								disabled={isLoading}
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

					<Field>
						<Field.Label className="whitespace-nowrap">
							Confirm password<span className="text-primary">*</span>
						</Field.Label>
						<div className="relative">
							<Input
								autoComplete="new-password"
								disabled={isLoading}
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
								variant="ghost"
							>
								{showConfirmPassword ? (
									<EyeSlashIcon className="size-4" />
								) : (
									<EyeIcon className="size-4" />
								)}
							</Button>
						</div>
					</Field>
				</div>

				<VisuallyHidden>
					<input
						aria-hidden="true"
						checked={isHoneypot}
						disabled={isLoading}
						onChange={(e) => setIsHoneypot(e.target.checked)}
						tabIndex={-1}
						type="checkbox"
					/>
				</VisuallyHidden>

				<Button
					className="mt-4 w-full"
					loading={isLoading}
					size="lg"
					type="submit"
				>
					<span className="hidden sm:inline">Create account</span>
					<span className="sm:hidden">Sign up</span>
				</Button>

				<Text
					className="mx-auto max-w-xs text-center text-[11px] leading-relaxed"
					tone="muted"
				>
					By creating an account, you agree to the{" "}
					<Link
						className="font-medium text-accent-foreground duration-200 hover:text-accent-foreground/80"
						href="https://www.databuddy.cc/terms"
						target="_blank"
					>
						Terms
					</Link>{" "}
					and{" "}
					<Link
						className="font-medium text-accent-foreground duration-200 hover:text-accent-foreground/80"
						href="https://www.databuddy.cc/privacy"
						target="_blank"
					>
						Privacy Policy
					</Link>
					.
				</Text>
			</form>
		</div>
	);

	const renderContent = () => {
		switch (registrationStep) {
			case "verification-needed":
				return renderVerificationContent();
			default:
				return renderFormContent();
		}
	};

	return (
		<>
			<div className="mb-8 space-y-1.5 px-6">{renderHeaderContent()}</div>
			<div className="px-6">{renderContent()}</div>
			{registrationStep === "form" && (
				<div className="mt-4 text-center">
					<Text tone="muted">
						Already have an account?{" "}
						<Link
							className="font-medium text-accent-foreground duration-200 hover:text-accent-foreground/60"
							href={
								callback
									? `/login?callback=${encodeURIComponent(callback)}`
									: "/login"
							}
						>
							Sign in
						</Link>
					</Text>
				</div>
			)}
		</>
	);
}

export default function RegisterPage() {
	return (
		<Suspense
			fallback={
				<div className="flex h-40 items-center justify-center">
					<Spinner size="lg" />
				</div>
			}
		>
			<RegisterPageContent />
		</Suspense>
	);
}
