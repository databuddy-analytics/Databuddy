"use client";

import { authClient } from "@databuddy/auth/client";
import { useMutation } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { QRCode } from "react-qrcode-logo";
import { toast } from "sonner";
import { setPasswordForOAuthUser } from "@/app/actions/users";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import {
	CaretDownIcon,
	CheckCircleIcon,
	CopyIcon,
	DeviceMobileIcon,
	KeyIcon,
	ShieldCheckIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Button, Field, Input, Text } from "@databuddy/ui";
import { Dialog, OtpInput } from "@databuddy/ui/client";

type TwoFactorStep =
	| "set-password"
	| "password"
	| "setup"
	| "verify"
	| "backup"
	| "manage";

interface TwoFactorDialogProps {
	hasCredentialAccount: boolean;
	isEnabled: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
	open: boolean;
}

const MIN_PASSWORD_LENGTH = 8;
const TOTP_SECRET_REGEX = /secret=([A-Z2-7]+)/i;
const QR_SIZE = 160;
const QR_FOREGROUND_DARK = "#e7e8eb";
const QR_FOREGROUND_LIGHT = "#27282d";

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
	const initialStep = useMemo((): TwoFactorStep => {
		if (isEnabled) {
			return "manage";
		}
		if (!hasCredentialAccount) {
			return "set-password";
		}
		return "password";
	}, [isEnabled, hasCredentialAccount]);

	const { resolvedTheme } = useTheme();
	const [step, setStep] = useState<TwoFactorStep>(initialStep);
	const [password, setPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [secret, setSecret] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [verifyCode, setVerifyCode] = useState("");
	const [showSecret, setShowSecret] = useState(false);

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
		}
	}, [open, initialStep]);

	const isNewPasswordValid =
		newPassword.length >= MIN_PASSWORD_LENGTH &&
		newPassword === confirmPassword;

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

	const { isCopied: copiedBackup, copyToClipboard: copyBackupCodes } =
		useCopyToClipboard({
			onCopy: () => toast.success("Backup codes copied to clipboard"),
		});

	const { copyToClipboard: copySecret } = useCopyToClipboard({
		onCopy: () => toast.success("Secret key copied to clipboard"),
	});

	const isPending =
		setPasswordMutation.isPending ||
		enableMutation.isPending ||
		verifyMutation.isPending ||
		disableMutation.isPending ||
		regenerateBackupMutation.isPending;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<Dialog.Content className="w-[95vw] max-w-md sm:w-full">
				{step === "set-password" && (
					<>
						<Dialog.Header>
							<Dialog.Title>Set a password</Dialog.Title>
							<Dialog.Description>
								You signed up with a social account. A password is needed for
								2FA verification.
							</Dialog.Description>
						</Dialog.Header>

						<Dialog.Body className="space-y-4">
							<div className="flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
								<KeyIcon className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
								<Text
									className="text-blue-600 dark:text-blue-400"
									variant="caption"
								>
									This password will only be used for security actions like
									enabling or disabling 2FA.
								</Text>
							</div>

							<Field>
								<Field.Label>New password</Field.Label>
								<Input
									autoComplete="new-password"
									onChange={(e) => setNewPassword(e.target.value)}
									placeholder="Min. 8 characters"
									type="password"
									value={newPassword}
								/>
							</Field>

							<Field>
								<Field.Label>Confirm password</Field.Label>
								<Input
									autoComplete="new-password"
									onChange={(e) => setConfirmPassword(e.target.value)}
									placeholder="Confirm your password"
									type="password"
									value={confirmPassword}
								/>
							</Field>
						</Dialog.Body>

						<Dialog.Footer>
							<Dialog.Close>
								<Button variant="secondary">Cancel</Button>
							</Dialog.Close>
							<Button
								disabled={!isNewPasswordValid || isPending}
								loading={setPasswordMutation.isPending}
								onClick={() => setPasswordMutation.mutate()}
							>
								Set password & continue
							</Button>
						</Dialog.Footer>
					</>
				)}

				{step === "password" && (
					<>
						<Dialog.Header>
							<Dialog.Title>Enable two-factor authentication</Dialog.Title>
							<Dialog.Description>
								Enter your password to begin setting up 2FA.
							</Dialog.Description>
						</Dialog.Header>

						<Dialog.Body>
							<Field>
								<Field.Label>Password</Field.Label>
								<Input
									autoComplete="current-password"
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									type="password"
									value={password}
								/>
							</Field>
						</Dialog.Body>

						<Dialog.Footer>
							<Dialog.Close>
								<Button variant="secondary">Cancel</Button>
							</Dialog.Close>
							<Button
								disabled={!password || isPending}
								loading={enableMutation.isPending}
								onClick={() => enableMutation.mutate()}
							>
								Continue
							</Button>
						</Dialog.Footer>
					</>
				)}

				{step === "setup" && (
					<>
						<Dialog.Header>
							<Dialog.Title>Set up authenticator</Dialog.Title>
							<Dialog.Description>
								Scan the QR code with your authenticator app (Google
								Authenticator, Authy, 1Password, etc.)
							</Dialog.Description>
						</Dialog.Header>

						<Dialog.Body className="space-y-4">
							<div className="flex justify-center rounded-md border border-border/60 p-4">
								<QRCode
									bgColor="transparent"
									ecLevel="M"
									fgColor={
										resolvedTheme === "dark"
											? QR_FOREGROUND_DARK
											: QR_FOREGROUND_LIGHT
									}
									quietZone={0}
									size={QR_SIZE}
									value={totpUri}
								/>
							</div>

							<div className="space-y-2">
								<button
									className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs hover:bg-interactive-hover"
									onClick={() => setShowSecret(!showSecret)}
									type="button"
								>
									<DeviceMobileIcon className="size-4 text-muted-foreground" />
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
									<div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/50 p-3">
										<code className="flex-1 select-all break-all font-mono text-xs">
											{secret}
										</code>
										<Button
											onClick={() => copySecret(secret)}
											size="sm"
											variant="ghost"
										>
											<CopyIcon className="size-3.5" />
										</Button>
									</div>
								)}
							</div>
						</Dialog.Body>

						<Dialog.Footer>
							<Button onClick={() => setStep("password")} variant="secondary">
								Back
							</Button>
							<Button onClick={() => setStep("verify")}>I've scanned it</Button>
						</Dialog.Footer>
					</>
				)}

				{step === "verify" && (
					<>
						<Dialog.Header>
							<Dialog.Title>Verify setup</Dialog.Title>
							<Dialog.Description>
								Enter the 6-digit code from your authenticator app to confirm
								it's working.
							</Dialog.Description>
						</Dialog.Header>

						<Dialog.Body>
							<OtpInput autoFocus onChange={setVerifyCode} value={verifyCode} />
						</Dialog.Body>

						<Dialog.Footer>
							<Button onClick={() => setStep("setup")} variant="secondary">
								Back
							</Button>
							<Button
								disabled={verifyCode.length !== 6 || isPending}
								loading={verifyMutation.isPending}
								onClick={() => verifyMutation.mutate()}
							>
								Verify & enable
							</Button>
						</Dialog.Footer>
					</>
				)}

				{step === "backup" && (
					<>
						<Dialog.Header>
							<Dialog.Title>Save your backup codes</Dialog.Title>
							<Dialog.Description>
								Store these somewhere safe. Each code can only be used once if
								you lose your authenticator.
							</Dialog.Description>
						</Dialog.Header>

						<Dialog.Body className="space-y-3">
							<div className="grid grid-cols-2 gap-1.5 rounded-md border border-border/60 bg-secondary/30 p-3">
								{backupCodes.map((code, i) => (
									<code
										className="rounded bg-card px-2 py-1 text-center font-mono text-xs"
										key={i}
									>
										{code}
									</code>
								))}
							</div>

							<div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-3">
								<WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
								<Text className="text-warning" variant="caption">
									If you lose access to your authenticator, these codes are the
									only way to recover your account.
								</Text>
							</div>
						</Dialog.Body>

						<Dialog.Footer>
							<Button
								className="flex-1"
								onClick={() => copyBackupCodes(backupCodes.join("\n"))}
								variant="secondary"
							>
								{copiedBackup ? (
									<>
										<CheckCircleIcon className="size-3.5 text-success" />
										Copied!
									</>
								) : (
									<>
										<CopyIcon className="size-3.5" />
										Copy codes
									</>
								)}
							</Button>
							<Button className="flex-1" onClick={() => onOpenChange(false)}>
								Done
							</Button>
						</Dialog.Footer>
					</>
				)}

				{step === "manage" && (
					<>
						<Dialog.Header>
							<Dialog.Title>Two-factor authentication</Dialog.Title>
							<Dialog.Description>Manage your 2FA settings.</Dialog.Description>
						</Dialog.Header>

						<Dialog.Body className="space-y-4">
							<div className="flex items-start gap-2 rounded-md border border-success/20 bg-success/5 p-3">
								<ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
								<Text className="text-success" variant="caption">
									Two-factor authentication is active. Your account has an extra
									layer of security.
								</Text>
							</div>

							<Field>
								<Field.Label>Password</Field.Label>
								<Input
									autoComplete="current-password"
									onChange={(e) => setPassword(e.target.value)}
									placeholder="Required for changes"
									type="password"
									value={password}
								/>
							</Field>

							{backupCodes.length > 0 && (
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<Text variant="label">Backup codes</Text>
										<Button
											onClick={() => copyBackupCodes(backupCodes.join("\n"))}
											size="sm"
											variant="ghost"
										>
											{copiedBackup ? (
												<CheckCircleIcon className="size-3.5 text-success" />
											) : (
												<CopyIcon className="size-3.5" />
											)}
										</Button>
									</div>
									<div className="grid grid-cols-2 gap-1.5 rounded-md border border-border/60 bg-secondary/30 p-3">
										{backupCodes.map((code, i) => (
											<code
												className="rounded bg-card px-2 py-1 text-center font-mono text-xs"
												key={i}
											>
												{code}
											</code>
										))}
									</div>
								</div>
							)}
						</Dialog.Body>

						<Dialog.Footer>
							<Button
								disabled={!password || isPending}
								loading={regenerateBackupMutation.isPending}
								onClick={() => regenerateBackupMutation.mutate()}
								variant="secondary"
							>
								New backup codes
							</Button>
							<Button
								disabled={!password || isPending}
								loading={disableMutation.isPending}
								onClick={() => disableMutation.mutate()}
								tone="destructive"
							>
								Disable 2FA
							</Button>
						</Dialog.Footer>
					</>
				)}
			</Dialog.Content>
		</Dialog>
	);
}
