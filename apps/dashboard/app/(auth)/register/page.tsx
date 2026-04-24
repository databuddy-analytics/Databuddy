"use client";

import { authClient } from "@databuddy/auth/client";
import { track } from "@databuddy/sdk";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { EyeIcon } from "@phosphor-icons/react";
import { EyeSlashIcon } from "@phosphor-icons/react";
import { InfoIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ds/button";
import { Checkbox } from "@/components/ds/checkbox";
import { Divider } from "@/components/ds/divider";
import { Field } from "@/components/ds/field";
import { Input } from "@/components/ds/input";
import { Spinner } from "@/components/ds/spinner";
import { Text } from "@/components/ds/text";
import { Tooltip } from "@/components/ds/tooltip";
import { GithubMark, GoogleMark } from "@/components/ui/brand-icons";
import VisuallyHidden from "@/components/ui/visuallyhidden";

function RegisterPageContent() {
	const router = useRouter();
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

	const trackSignUp = (
		method: "email" | "social",
		provider?: "github" | "google"
	) => {
		try {
			track("signup_completed", {
				method: method === "social" ? `${method}_${provider}` : method,
				plan: selectedPlan || undefined,
			});
		} catch (error) {
			console.error("Failed to track sign up event:", error);
		}
	};

	const getCallbackUrl = () => {
		if (selectedPlan) {
			localStorage.setItem("pendingPlanSelection", selectedPlan);
			return `/billing/plans?plan=${selectedPlan}`;
		}
		return callback;
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
			callbackURL: getCallbackUrl(),
			fetchOptions: {
				onSuccess: () => {
					trackSignUp("email");
					toast.success(
						"Account created! Please check your email to verify your account."
					);
					setRegistrationStep("verification-needed");
					if (selectedPlan) {
						localStorage.setItem("pendingPlanSelection", selectedPlan);
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
				callbackURL: getCallbackUrl(),
				newUserCallbackURL: "/onboarding",
				fetchOptions: {
					onSuccess: () => {
						trackSignUp("social", provider);
					},
					onError: () => {
						toast.error(
							`${provider === "github" ? "GitHub" : "Google"} login failed. Please try again.`
						);
						setIsLoading(false);
					},
				},
			});
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
			case "success":
				return (
					<>
						<Text as="h1" className="text-balance font-medium text-2xl">
							Success!
						</Text>
						<Text tone="muted">
							Your account has been created successfully. You can now sign in to
							access your dashboard.
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

	const renderSuccessContent = () => (
		<Button className="w-full" onClick={() => router.push("/login")} size="lg">
			<span className="hidden sm:inline">Continue to login</span>
			<span className="sm:hidden">Continue</span>
		</Button>
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

				<div className="flex items-center gap-2">
					<Checkbox
						checked={acceptTerms}
						className="cursor-pointer data-[state=checked]:border-brand-purple/50 data-[state=checked]:bg-brand-purple data-[state=unchecked]:bg-input"
						disabled={isLoading}
						id="terms"
						onCheckedChange={(checked) => setAcceptTerms(checked as boolean)}
					/>
					<Field.Label
						className="text-[11px] text-muted-foreground leading-relaxed"
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
					</Field.Label>
				</div>

				<Button
					className="mt-4 w-full"
					loading={isLoading}
					size="lg"
					type="submit"
				>
					<span className="hidden sm:inline">Create account</span>
					<span className="sm:hidden">Sign up</span>
				</Button>
			</form>
		</div>
	);

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
