"use client";

import { authClient } from "@databuddy/auth/client";
import { ArrowLeftIcon, EyeIcon, EyeSlashIcon, SpinnerIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ForgotPasswordPage() {
	const router = useRouter();
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

		const { data, error } = await authClient.emailOtp.sendVerificationOtp({
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
		if (!otp || !password || !confirmPassword) {
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

		const { data, error } = await authClient.emailOtp.resetPassword({
			email,
			otp,
			password,
		});

		if (error) {
			setIsLoading(false);
			toast.error(error.message || "Failed to reset password. Please try again.");
			return;
		}

		setIsLoading(false);
		toast.success("Password reset successfully. Redirecting to login...");
		setTimeout(() => {
			router.push("/login");
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
				<div className="mb-8 space-y-1 px-6 text-left">
					<h1 className="font-medium text-2xl text-foreground">
						Reset your password
					</h1>
					<p className="text-muted-foreground text-sm">
						We&apos;ll send you a verification code to reset your password
					</p>
				</div>
				<div className="relative px-6">
					<div className="relative z-10">
						<form className="space-y-5" onSubmit={handleSendOTP}>
							<div className="space-y-3">
								<Label className="font-medium text-foreground" htmlFor="forgot-email">
									Email<span className="text-primary">*</span>
								</Label>
								<Input
									autoComplete="email"
									id="forgot-email"
									name="email"
									onChange={(e) => setEmail(e.target.value)}
									placeholder="Enter your email"
									required
									type="email"
									value={email}
								/>
							</div>
							<Button className="w-full" disabled={isLoading} type="submit">
								{isLoading ? (
									<>
										<SpinnerIcon className="mr-2 size-4 animate-spin" />
										Sending verification code...
									</>
								) : (
									"Send verification code"
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

	return (
		<>
			<div className="mb-8 space-y-1 px-6 text-left">
				<h1 className="font-medium text-2xl text-foreground">
					Reset your password
				</h1>
				<p className="text-muted-foreground text-sm">
					Enter the verification code sent to{" "}
					<strong className="text-foreground">{email}</strong>
				</p>
			</div>
			<div className="relative px-6">
				<div className="relative z-10">
					<form className="space-y-5" onSubmit={handleResetPassword}>
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label className="font-medium text-foreground" htmlFor="otp">
									Verification code<span className="text-primary">*</span>
								</Label>
								<Button
									className="h-auto p-0 text-xs text-accent-foreground/60 duration-200 hover:text-accent-foreground"
									disabled={isResending}
									onClick={handleResendOTP}
									type="button"
									variant="ghost"
								>
									{isResending ? (
										<>
											<SpinnerIcon className="mr-1 size-3 animate-spin" />
											Sending...
										</>
									) : (
										"Resend code"
									)}
								</Button>
							</div>
							<Input
								autoComplete="one-time-code"
								id="otp"
								inputMode="numeric"
								maxLength={6}
								name="otp"
								onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
								placeholder="000000"
								required
								type="text"
								value={otp}
							/>
						</div>
						<div className="space-y-3">
							<Label className="font-medium text-foreground" htmlFor="password">
								New password<span className="text-primary">*</span>
							</Label>
							<div className="relative">
								<Input
									autoComplete="new-password"
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
						<div className="space-y-3">
							<Label
								className="font-medium text-foreground"
								htmlFor="confirm-password"
							>
								Confirm password<span className="text-primary">*</span>
							</Label>
							<div className="relative">
								<Input
									autoComplete="new-password"
									id="confirm-password"
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
						<Button className="w-full" disabled={isLoading} type="submit">
							{isLoading ? (
								<>
									<SpinnerIcon className="mr-2 size-4 animate-spin" />
									Resetting password...
								</>
							) : (
								"Reset password"
							)}
						</Button>
						<Button
							className="w-full"
							disabled={isLoading}
							onClick={() => setStep("email")}
							type="button"
							variant="ghost"
						>
							Back
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
				<div className="flex h-screen items-center justify-center bg-background">
					<div className="relative">
						<div className="absolute inset-0 animate-ping rounded-full bg-primary/20 blur-xl" />
						<SpinnerIcon className="relative size-8 animate-spin text-primary" />
					</div>
				</div>
			}
		>
			<ForgotPasswordPage />
		</Suspense>
	);
}
