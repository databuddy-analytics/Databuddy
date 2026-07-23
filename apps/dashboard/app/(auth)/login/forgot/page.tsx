"use client";

import { authClient } from "@databuddy/auth/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, useQueryState } from "nuqs";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon } from "@databuddy/ui/icons";
import { Button, Field, Input, Spinner, Text } from "@databuddy/ui";
import { OtpInput } from "@databuddy/ui/client";
import { safeCallbackPath } from "@/lib/safe-callback";

function ForgotPasswordPage() {
	const router = useRouter();
	const [callback] = useQueryState(
		"callback",
		parseAsString.withDefault("/websites")
	);
	const loginHref = `/login?callback=${encodeURIComponent(safeCallbackPath(callback))}`;
	const [step, setStep] = useState<"email" | "reset">("email");
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isResending, setIsResending] = useState(false);

	const handleSendOTP = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) {
			toast.error("Please enter your email address");
			return;
		}
		setIsLoading(true);

		const { error } = await authClient.emailOtp.sendVerificationOtp({
			email,
			type: "forget-password",
		});

		if (error) {
			setIsLoading(false);
			toast.error(error.message || "Failed to send OTP. Please try again.");
			return;
		}

		setIsLoading(false);
		toast.success("OTP sent to your email address.");
		setStep("reset");
	};

	const handleResetPassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!(otp && password && confirmPassword)) {
			toast.error("Please fill in all fields");
			return;
		}
		if (password !== confirmPassword) {
			toast.error("Passwords do not match");
			return;
		}
		if (password.length < 8) {
			toast.error("Password must be at least 8 characters long");
			return;
		}

		setIsLoading(true);

		const { error } = await authClient.emailOtp.resetPassword({
			email,
			otp,
			password,
		});

		if (error) {
			setIsLoading(false);
			toast.error(
				error.message || "Failed to reset password. Please try again."
			);
			return;
		}

		setIsLoading(false);
		toast.success("Password reset successfully. Redirecting to login...");
		setTimeout(() => {
			router.push(loginHref);
		}, 1500);
	};

	const handleResendOTP = async () => {
		if (!email) {
			toast.error("Email is required");
			return;
		}
		setIsResending(true);

		const { error } = await authClient.emailOtp.sendVerificationOtp({
			email,
			type: "forget-password",
		});

		if (error) {
			setIsResending(false);
			toast.error(error.message || "Failed to resend OTP. Please try again.");
			return;
		}

		setIsResending(false);
		toast.success("OTP resent to your email address.");
	};

	if (step === "email") {
		return (
			<>
				<div className="mb-8 space-y-1.5 px-6">
					<Text as="h1" className="text-balance font-medium text-2xl">
						Reset your password
					</Text>
					<Text tone="muted">
						We&apos;ll send you a verification code to reset your password
					</Text>
				</div>

				<div className="space-y-5 px-6">
					<form className="space-y-5" onSubmit={handleSendOTP}>
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
						<Button className="w-full" loading={isLoading} type="submit">
							Send verification code
						</Button>
					</form>
				</div>

				<div className="mt-5 flex items-center justify-center px-6">
					<Link
						className="text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
						href={loginHref}
					>
						<ArrowLeftIcon className="mr-1 inline size-3" />
						Back to login
					</Link>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="mb-8 space-y-1.5 px-6">
				<Text as="h1" className="text-balance font-medium text-2xl">
					Reset your password
				</Text>
				<Text tone="muted">
					Enter the verification code sent to{" "}
					<strong className="text-foreground">{email}</strong>
				</Text>
			</div>

			<div className="space-y-5 px-6">
				<form className="space-y-5" onSubmit={handleResetPassword}>
					<div className="space-y-1.5">
						<Field.Label htmlFor="otp">
							Verification code<span className="text-primary">*</span>
						</Field.Label>
						<OtpInput
							autoComplete="one-time-code"
							className="justify-start"
							id="otp"
							name="otp"
							onChange={setOtp}
							value={otp}
						/>
						<Button
							className="h-auto p-0 text-xs"
							loading={isResending}
							onClick={handleResendOTP}
							variant="ghost"
						>
							Didn&apos;t receive a code? Resend
						</Button>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field>
							<Field.Label>
								New password<span className="text-primary">*</span>
							</Field.Label>
							<div className="relative">
								<Input
									autoComplete="new-password"
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

						<Field>
							<Field.Label className="whitespace-nowrap">
								Confirm password<span className="text-primary">*</span>
							</Field.Label>
							<div className="relative">
								<Input
									autoComplete="new-password"
									name="confirm-password"
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder="••••••••"
									required
									type={showConfirmPassword ? "text" : "password"}
									value={confirmPassword}
								/>
								<Button
									aria-label={
										showConfirmPassword
											? "Hide confirm password"
											: "Show confirm password"
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

					<Button className="w-full" loading={isLoading} type="submit">
						Reset password
					</Button>
				</form>
			</div>

			<div className="mt-5 flex items-center justify-center px-6">
				<Link
					className="text-[13px] text-accent-foreground/60 duration-200 hover:text-accent-foreground"
					href={loginHref}
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
			<ForgotPasswordPage />
		</Suspense>
	);
}
