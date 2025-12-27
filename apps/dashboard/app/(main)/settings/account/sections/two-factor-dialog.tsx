"use client";

import { authClient } from "@databuddy/auth/client";
import {
	CaretDownIcon,
	CheckCircleIcon,
	CircleNotchIcon,
	CopyIcon,
	DeviceMobileIcon,
	KeyIcon,
	ShieldCheckIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { setPasswordForOAuthUser } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TwoFactorStep =
	| "set-password"
	| "password"
	| "setup"
	| "verify"
	| "backup"
	| "manage";

type TwoFactorDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isEnabled: boolean;
	hasCredentialAccount: boolean;
	onSuccess: () => void;
};

const MIN_PASSWORD_LENGTH = 8;
const TOTP_SECRET_REGEX = /secret=([A-Z2-7]+)/i;

function extractSecretFromTotpUri(uri: string): string {
	const match = uri.match(TOTP_SECRET_REGEX);
	return match?.[1] ?? "";
}

export function TwoFactorDialog({
	open,
	onOpenChange,
	isEnabled,
	hasCredentialAccount,
	onSuccess,
}: TwoFactorDialogProps) {
	// Determine initial step based on current state
	const initialStep = useMemo((): TwoFactorStep => {
		if (isEnabled) {
			return "manage";
		}
		if (!hasCredentialAccount) {
			return "set-password";
		}
		return "password";
	}, [isEnabled, hasCredentialAccount]);

	const [step, setStep] = useState<TwoFactorStep>(initialStep);
	const [password, setPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [secret, setSecret] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [verifyCode, setVerifyCode] = useState("");
	const [showSecret, setShowSecret] = useState(false);
	const [copiedBackup, setCopiedBackup] = useState(false);

	// Reset state when dialog closes
	useEffect(() => {
		if (!open) {
			setStep(initialStep);
			setPassword("");
			setNewPassword("");
			setConfirmPassword("");
			setTotpUri("");
			setSecret("");
			setBackupCodes([]);
			setVerifyCode("");
			setShowSecret(false);
			setCopiedBackup(false);
		}
	}, [open, initialStep]);

	// Password validation
	const isNewPasswordValid =
		newPassword.length >= MIN_PASSWORD_LENGTH &&
		newPassword === confirmPassword;

	// Set password mutation for OAuth users
	const setPasswordMutation = useMutation({
		mutationFn: async () => {
			if (newPassword !== confirmPassword) {
				throw new Error("Passwords do not match");
			}
			if (newPassword.length < MIN_PASSWORD_LENGTH) {
				throw new Error(
					`Password must be at least ${MIN_PASSWORD_LENGTH} characters`
				);
			}
			// Double-check: shouldn't reach here if user already has credentials
			if (hasCredentialAccount) {
				throw new Error(
					"You already have a password. Use change password instead."
				);
			}
			const result = await setPasswordForOAuthUser(newPassword);
			if (result.error) {
				throw new Error(result.error);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Password set successfully!");
			setPassword(newPassword);
			setStep("password");
			onSuccess();
		},
	});

	// Enable 2FA mutation
	const enableMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.twoFactor.enable({ password });
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result.data;
		},
		onSuccess: (data) => {
			if (data?.totpURI) {
				setTotpUri(data.totpURI);
				setSecret(extractSecretFromTotpUri(data.totpURI));
			}
			if (data?.backupCodes) {
				setBackupCodes(data.backupCodes);
			}
			setStep("setup");
		},
	});

	// Verify TOTP mutation
	const verifyMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.twoFactor.verifyTotp({
				code: verifyCode,
			});
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result.data;
		},
		onSuccess: () => {
			toast.success("Two-factor authentication enabled!");
			setStep("backup");
			onSuccess();
		},
	});

	// Disable 2FA mutation
	const disableMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.twoFactor.disable({ password });
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result.data;
		},
		onSuccess: () => {
			toast.success("Two-factor authentication disabled");
			onSuccess();
			onOpenChange(false);
		},
	});

	// Generate new backup codes mutation
	const regenerateBackupMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.twoFactor.generateBackupCodes({
				password,
			});
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result.data;
		},
		onSuccess: (data) => {
			if (data?.backupCodes) {
				setBackupCodes(data.backupCodes);
				toast.success("New backup codes generated");
			}
		},
	});

	const handleCopyBackupCodes = useCallback(async () => {
		const codesText = backupCodes.join("\n");
		await navigator.clipboard.writeText(codesText);
		setCopiedBackup(true);
		toast.success("Backup codes copied to clipboard");
		setTimeout(() => setCopiedBackup(false), 2000);
	}, [backupCodes]);

	const handleCopySecret = useCallback(async () => {
		await navigator.clipboard.writeText(secret);
		toast.success("Secret key copied to clipboard");
	}, [secret]);

	const isPending =
		setPasswordMutation.isPending ||
		enableMutation.isPending ||
		verifyMutation.isPending ||
		disableMutation.isPending ||
		regenerateBackupMutation.isPending;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{step === "set-password" && "Set Up a Password"}
						{step === "password" && "Enable Two-Factor Authentication"}
						{step === "setup" && "Set Up Authenticator"}
						{step === "verify" && "Verify Your Setup"}
						{step === "backup" && "Save Your Backup Codes"}
						{step === "manage" && "Manage Two-Factor Authentication"}
					</DialogTitle>
					<DialogDescription>
						{step === "set-password" &&
							"You signed up with a social account. Create a password to enable 2FA."}
						{step === "password" &&
							"Enter your password to begin setting up 2FA."}
						{step === "setup" &&
							"Link your account to an authenticator app for extra security."}
						{step === "verify" &&
							"Confirm your authenticator is set up correctly."}
						{step === "backup" &&
							"Store these codes safely. Each can only be used once."}
						{step === "manage" &&
							"Manage your two-factor authentication settings."}
					</DialogDescription>
				</DialogHeader>

				<div className="py-4">
					{step === "set-password" && (
						<div className="space-y-4">
							<div className="flex items-center gap-3 rounded border bg-blue-500/10 p-4">
								<div className="flex size-10 items-center justify-center rounded-full bg-blue-500/20">
									<KeyIcon
										className="size-5 text-blue-600 dark:text-blue-400"
										weight="duotone"
									/>
								</div>
								<div>
									<p className="font-medium text-sm">Password required</p>
									<p className="text-muted-foreground text-xs">
										2FA requires a password for verification
									</p>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="new-password">New Password</Label>
								<Input
									autoComplete="new-password"
									id="new-password"
									onChange={(e) => setNewPassword(e.target.value)}
									placeholder="Min. 8 characters"
									type="password"
									value={newPassword}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="confirm-password">Confirm Password</Label>
								<Input
									autoComplete="new-password"
									id="confirm-password"
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder="Confirm your password"
									type="password"
									value={confirmPassword}
								/>
							</div>
						</div>
					)}

					{/* Step: Password */}
					{step === "password" && (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="2fa-password">Password</Label>
								<Input
									autoComplete="current-password"
									id="2fa-password"
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									type="password"
									value={password}
								/>
							</div>
						</div>
					)}

					{/* Step: Setup with QR Code */}
					{step === "setup" && (
						<div className="space-y-5">
							{/* Step 1: Install app */}
							<div className="flex items-start gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
									1
								</div>
								<div className="flex-1 space-y-1">
									<p className="font-medium text-sm">
										Install an authenticator app
									</p>
									<p className="text-muted-foreground text-xs">
										Google Authenticator, Authy, 1Password, or any TOTP app
									</p>
								</div>
							</div>

							{/* Step 2: Scan QR */}
							<div className="flex items-start gap-3">
								<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary font-medium text-primary-foreground text-xs">
									2
								</div>
								<div className="flex-1 space-y-3">
									<div>
										<p className="font-medium text-sm">Scan this QR code</p>
										<p className="text-muted-foreground text-xs">
											Open your app and scan to add your account
										</p>
									</div>

									<div className="flex justify-center">
										<div className="rounded-lg border-2 border-dashed bg-white p-3">
											<QRCodeSVG
												bgColor="transparent"
												fgColor="#000"
												level="M"
												size={160}
												value={totpUri}
											/>
										</div>
									</div>

									{/* Manual entry toggle */}
									<div className="space-y-2">
										<button
											className="flex w-full items-center gap-2 text-left text-xs"
											onClick={() => setShowSecret(!showSecret)}
											type="button"
										>
											<DeviceMobileIcon
												className="size-4 text-muted-foreground"
												weight="duotone"
											/>
											<span className="flex-1 text-muted-foreground">
												Can't scan? Enter code manually
											</span>
											<CaretDownIcon
												className={cn(
													"size-3 text-muted-foreground transition-transform",
													showSecret && "rotate-180"
												)}
											/>
										</button>

										{showSecret && (
											<div className="rounded border bg-accent/50 p-3">
												<p className="mb-1.5 text-muted-foreground text-xs">
													Secret key
												</p>
												<div className="flex items-center justify-between gap-2">
													<code className="flex-1 select-all break-all font-mono text-xs">
														{secret}
													</code>
													<Button
														onClick={handleCopySecret}
														size="sm"
														variant="ghost"
													>
														<CopyIcon className="size-4" />
													</Button>
												</div>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Step: Verify */}
					{step === "verify" && (
						<div className="flex flex-col items-center space-y-6">
							<div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
								<ShieldCheckIcon
									className="size-7 text-primary"
									weight="duotone"
								/>
							</div>

							<div className="space-y-4 text-center">
								<div className="space-y-1">
									<p className="font-medium">Enter verification code</p>
									<p className="text-muted-foreground text-sm">
										Open your authenticator app and enter the 6-digit code
									</p>
								</div>

								<div className="flex justify-center">
									<InputOTP
										autoFocus
										maxLength={6}
										onChange={setVerifyCode}
										value={verifyCode}
									>
										<InputOTPGroup>
											<InputOTPSlot index={0} />
											<InputOTPSlot index={1} />
											<InputOTPSlot index={2} />
											<InputOTPSlot index={3} />
											<InputOTPSlot index={4} />
											<InputOTPSlot index={5} />
										</InputOTPGroup>
									</InputOTP>
								</div>
							</div>
						</div>
					)}

					{/* Step: Backup Codes */}
					{step === "backup" && (
						<div className="space-y-4">
							<div className="rounded border bg-accent/30 p-4">
								<div className="grid grid-cols-2 gap-2">
									{backupCodes.map((code, i) => (
										<code
											className="rounded bg-background px-2 py-1 text-center font-mono text-sm"
											key={i}
										>
											{code}
										</code>
									))}
								</div>
							</div>

							<div className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
								<WarningCircleIcon className="size-5 shrink-0" />
								<p className="text-xs">
									Store these codes in a safe place. Each code can only be used
									once to recover your account if you lose access to your
									authenticator app.
								</p>
							</div>
						</div>
					)}

					{/* Step: Manage */}
					{step === "manage" && (
						<div className="space-y-4">
							<div className="flex items-center gap-3 rounded border bg-green-500/10 p-4">
								<div className="flex size-10 items-center justify-center rounded-full bg-green-500/20">
									<ShieldCheckIcon
										className="size-5 text-green-600 dark:text-green-400"
										weight="duotone"
									/>
								</div>
								<div>
									<p className="font-medium text-sm">2FA is enabled</p>
									<p className="text-muted-foreground text-xs">
										Your account has an extra layer of security
									</p>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="manage-password">
									Password (required for changes)
								</Label>
								<Input
									autoComplete="current-password"
									id="manage-password"
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									type="password"
									value={password}
								/>
							</div>

							{backupCodes.length > 0 && (
								<div className="rounded border bg-accent/30 p-4">
									<div className="mb-2 flex items-center justify-between">
										<p className="font-medium text-sm">Backup Codes</p>
										<Button
											onClick={handleCopyBackupCodes}
											size="sm"
											variant="ghost"
										>
											{copiedBackup ? (
												<CheckCircleIcon className="size-4 text-green-500" />
											) : (
												<CopyIcon className="size-4" />
											)}
										</Button>
									</div>
									<div className="grid grid-cols-2 gap-2">
										{backupCodes.map((code, i) => (
											<code
												className="rounded bg-background px-2 py-1 text-center font-mono text-sm"
												key={i}
											>
												{code}
											</code>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</div>

				<DialogFooter className="gap-2 sm:gap-2">
					{step === "set-password" && (
						<>
							<Button onClick={() => onOpenChange(false)} variant="outline">
								Cancel
							</Button>
							<Button
								disabled={!isNewPasswordValid || isPending}
								onClick={() => setPasswordMutation.mutate()}
							>
								{setPasswordMutation.isPending && (
									<CircleNotchIcon className="mr-2 size-4 animate-spin" />
								)}
								Set Password & Continue
							</Button>
						</>
					)}

					{step === "password" && (
						<>
							<Button onClick={() => onOpenChange(false)} variant="outline">
								Cancel
							</Button>
							<Button
								disabled={!password || isPending}
								onClick={() => enableMutation.mutate()}
							>
								{enableMutation.isPending && (
									<CircleNotchIcon className="mr-2 size-4 animate-spin" />
								)}
								Continue
							</Button>
						</>
					)}

					{step === "setup" && (
						<>
							<Button onClick={() => setStep("password")} variant="outline">
								Back
							</Button>
							<Button onClick={() => setStep("verify")}>
								Continue to Verify
							</Button>
						</>
					)}

					{step === "verify" && (
						<>
							<Button onClick={() => setStep("setup")} variant="outline">
								Back
							</Button>
							<Button
								disabled={verifyCode.length !== 6 || isPending}
								onClick={() => verifyMutation.mutate()}
							>
								{verifyMutation.isPending && (
									<CircleNotchIcon className="mr-2 size-4 animate-spin" />
								)}
								Verify & Enable
							</Button>
						</>
					)}

					{step === "backup" && (
						<>
							<Button
								className="flex-1"
								onClick={handleCopyBackupCodes}
								variant="outline"
							>
								{copiedBackup ? (
									<>
										<CheckCircleIcon className="mr-2 size-4 text-green-500" />
										Copied!
									</>
								) : (
									<>
										<CopyIcon className="mr-2 size-4" />
										Copy Codes
									</>
								)}
							</Button>
							<Button className="flex-1" onClick={() => onOpenChange(false)}>
								Done
							</Button>
						</>
					)}

					{step === "manage" && (
						<>
							<Button
								disabled={!password || isPending}
								onClick={() => regenerateBackupMutation.mutate()}
								variant="outline"
							>
								{regenerateBackupMutation.isPending && (
									<CircleNotchIcon className="mr-2 size-4 animate-spin" />
								)}
								New Backup Codes
							</Button>
							<Button
								disabled={!password || isPending}
								onClick={() => disableMutation.mutate()}
								variant="destructive"
							>
								{disableMutation.isPending && (
									<CircleNotchIcon className="mr-2 size-4 animate-spin" />
								)}
								Disable 2FA
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
