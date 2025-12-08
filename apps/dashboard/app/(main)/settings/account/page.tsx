"use client";

import { authClient } from "@databuddy/auth/client";
import type { Icon } from "@phosphor-icons/react";
import {
	CircleNotchIcon,
	GithubLogoIcon,
	GoogleLogoIcon,
	KeyIcon,
	LinkBreakIcon,
	LinkIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RightSidebar } from "@/components/right-sidebar";
import { UnsavedChangesFooter } from "../_components/settings-section";
import { TwoFactorDialog } from "./sections/two-factor-dialog";

// Types
type Account = {
	id: string;
	providerId: string;
	accountId: string;
	createdAt: Date;
};

type SocialProvider = "google" | "github";

// Constants
const SOCIAL_PROVIDERS: SocialProvider[] = ["google", "github"];

const PROVIDER_CONFIG: Record<string, { icon: Icon; name: string }> = {
	google: { icon: GoogleLogoIcon, name: "Google" },
	github: { icon: GithubLogoIcon, name: "GitHub" },
	credential: { icon: KeyIcon, name: "Password" },
};

// Helpers
function getInitials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

// Sub-components
function ChangePasswordDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const changePasswordMutation = useMutation({
		mutationFn: async () => {
			if (newPassword !== confirmPassword) {
				throw new Error("Passwords do not match");
			}
			const result = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: false,
			});
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Password changed successfully");
			onOpenChange(false);
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to change password");
		},
	});

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change Password</DialogTitle>
					<DialogDescription>
						Enter your current password and choose a new one.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="current-password">Current Password</Label>
						<Input
							autoComplete="current-password"
							id="current-password"
							onChange={(e) => setCurrentPassword(e.target.value)}
							placeholder="••••••••"
							type="password"
							value={currentPassword}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="new-password">New Password</Label>
						<Input
							autoComplete="new-password"
							id="new-password"
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder="••••••••"
							type="password"
							value={newPassword}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirm-password">Confirm New Password</Label>
						<Input
							autoComplete="new-password"
							id="confirm-password"
							onChange={(e) => setConfirmPassword(e.target.value)}
							placeholder="••••••••"
							type="password"
							value={confirmPassword}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={
							!(currentPassword && newPassword && confirmPassword) ||
							changePasswordMutation.isPending
						}
						onClick={() => changePasswordMutation.mutate()}
					>
						{changePasswordMutation.isPending && (
							<CircleNotchIcon className="mr-2 size-4 animate-spin" />
						)}
						Change Password
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// Main component
export default function AccountSettingsPage() {
	const queryClient = useQueryClient();
	const { data: session, isPending: isSessionLoading } =
		authClient.useSession();
	const user = session?.user;

	// Form state
	const [name, setName] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [showPasswordDialog, setShowPasswordDialog] = useState(false);
	const [showTwoFactorDialog, setShowTwoFactorDialog] = useState(false);
	const [unlinkProvider, setUnlinkProvider] = useState<SocialProvider | null>(
		null
	);

	// Initialize form when session loads
	useEffect(() => {
		if (user) {
			setName(user.name ?? "");
			setImageUrl(user.image ?? "");
		}
	}, [user]);

	// Queries
	const { data: accounts = [], isLoading: isAccountsLoading } = useQuery({
		queryKey: ["user-accounts"],
		queryFn: async () => {
			const result = await authClient.listAccounts();
			if (result.error) {
				throw new Error(result.error.message);
			}
			return (result.data ?? []) as Account[];
		},
	});

	// Mutations
	const updateProfileMutation = useMutation({
		mutationFn: async () => {
			const result = await authClient.updateUser({
				name,
				image: imageUrl || undefined,
			});
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Profile updated successfully");
			queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to update profile");
		},
	});

	const linkSocial = useMutation({
		mutationFn: async (provider: SocialProvider) => {
			const result = await authClient.linkSocial({
				provider,
				callbackURL: window.location.href,
			});
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result;
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to link account");
		},
	});

	const unlinkAccount = useMutation({
		mutationFn: async (providerId: string) => {
			const result = await authClient.unlinkAccount({ providerId });
			if (result.error) {
				throw new Error(result.error.message);
			}
			return result;
		},
		onSuccess: () => {
			toast.success("Account unlinked successfully");
			queryClient.invalidateQueries({ queryKey: ["user-accounts"] });
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to unlink account");
		},
	});

	const hasCredentialAccount = accounts.some(
		(acc) => acc.providerId === "credential"
	);
	const hasChanges =
		name !== (user?.name ?? "") || imageUrl !== (user?.image ?? "");

	const handleSaveChanges = () => {
		updateProfileMutation.mutate();
	};

	const handleDiscardChanges = () => {
		setName(user?.name ?? "");
		setImageUrl(user?.image ?? "");
	};

	const isLoading = isSessionLoading || isAccountsLoading;

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex-1 overflow-y-auto">
					{/* Row 1: Profile Photo + Account Status */}
					<div className="grid grid-cols-1 lg:contents">
						<section className="border-b px-5 py-6">
							<div className="mb-4">
								<h3 className="font-semibold text-sm">Profile Photo</h3>
								<p className="text-muted-foreground text-xs">
									Upload a photo to personalize your account
								</p>
							</div>	
							{isLoading ? (
								<div className="flex items-center gap-4">
									<Skeleton className="size-20 rounded-full" />
									<div className="space-y-2">
										<Skeleton className="h-9 w-32" />
										<Skeleton className="h-4 w-40" />
									</div>
								</div>
							) : (
								<div className="flex items-center gap-4">
									<Avatar className="size-20">
										<AvatarImage alt={name} src={imageUrl} />
										<AvatarFallback className="bg-primary/10 font-semibold text-primary text-xl">
											{getInitials(name || "User")}
										</AvatarFallback>
									</Avatar>
									<div className="flex-1 space-y-2">
										<Label htmlFor="image-url">Image URL</Label>
										<Input
											id="image-url"
											onChange={(e) => setImageUrl(e.target.value)}
											placeholder="https://example.com/avatar.jpg"
											value={imageUrl}
										/>
										<p className="text-muted-foreground text-xs">
											Enter a URL for your profile photo
										</p>
									</div>
								</div>
							)}
						</section>
					</div>

					{/* Row 2: Basic Info + Connected Apps */}
					<div className="grid grid-cols-1 lg:contents">
						<section className="border-b px-5 py-6">
							<div className="mb-4">
								<h3 className="font-semibold text-sm">Basic Information</h3>
								<p className="text-muted-foreground text-xs">
									Update your personal information
								</p>
							</div>
							{isLoading ? (
								<div className="grid gap-4 sm:grid-cols-2">
									<Skeleton className="h-16 w-full" />
									<Skeleton className="h-16 w-full" />
								</div>
							) : (
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label htmlFor="name">Full Name</Label>
										<Input
											id="name"
											onChange={(e) => setName(e.target.value)}
											placeholder="Your name…"
											value={name}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="email">Email Address</Label>
										<Input
											disabled
											id="email"
											type="email"
											value={user?.email ?? ""}
										/>
										<p className="text-muted-foreground text-xs">
											Email cannot be changed
										</p>
									</div>
								</div>
							)}
						</section>
					</div>

					{/* Row 3: Security */}
					<div className="grid grid-cols-1 lg:contents">
						<section className="border-b px-5 py-6">
							<div className="mb-4">
								<h3 className="font-semibold text-sm">Security</h3>
								<p className="text-muted-foreground text-xs">
									Secure your account with additional authentication
								</p>
							</div>
							<div className="space-y-4">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div className="min-w-0 flex-1">
										<p className="font-medium text-sm">
											Two-Factor Authentication
										</p>
										<p className="text-muted-foreground text-xs">
											Add an extra layer of security to your account
										</p>
									</div>
									<Button
										onClick={() => setShowTwoFactorDialog(true)}
										size="sm"
										variant="outline"
									>
										<ShieldCheckIcon className="mr-2 size-4" />
										{user?.twoFactorEnabled ? "Manage" : "Enable"}
									</Button>
								</div>

								{hasCredentialAccount && (
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
										<div className="min-w-0 flex-1">
											<p className="font-medium text-sm">Change Password</p>
											<p className="text-muted-foreground text-xs">
												Update your password regularly for security
											</p>
										</div>
										<Button
											onClick={() => setShowPasswordDialog(true)}
											size="sm"
											variant="outline"
										>
											<KeyIcon className="mr-2 size-4" />
											Change
										</Button>
									</div>
								)}
							</div>
						</section>
					</div>

					{/* Row 4: Connected Identities */}
					<div className="grid grid-cols-1 lg:contents">
						<section className="px-5 py-6">
							<div className="mb-4">
								<h3 className="font-semibold text-sm">Connected Identities</h3>
								<p className="text-muted-foreground text-xs">
									Link your accounts for easier sign-in
								</p>
							</div>
							<div className="space-y-2">
								{isAccountsLoading ? (
									<>
										<Skeleton className="h-10 w-full" />
										<Skeleton className="h-10 w-full" />
									</>
								) : (
									<>
										{SOCIAL_PROVIDERS.map((provider) => {
											const config = PROVIDER_CONFIG[provider];
											const ProviderIcon = config.icon;
											const connectedAccount = accounts.find(
												(acc) => acc.providerId === provider
											);
											const isOnlyAccount =
												accounts.length === 1 && !!connectedAccount;

											return (
												<div
													className="flex items-center justify-between py-2"
													key={provider}
												>
													<div className="flex items-center gap-3">
														<ProviderIcon className="size-5" weight="duotone" />
														<span className="font-medium text-sm">
															{config.name}
														</span>
													</div>
													{connectedAccount ? (
														<div className="flex items-center gap-2">
															<Button
																className="size-7"
																disabled={isOnlyAccount}
																onClick={() => setUnlinkProvider(provider)}
																size="icon"
																title={
																	isOnlyAccount
																		? "Cannot unlink your only login method"
																		: `Unlink ${config.name}`
																}
																variant="ghost"
															>
																<LinkBreakIcon className="size-4" />
															</Button>
															<Badge variant="green">Connected</Badge>
														</div>
													) : (
														<Button
															disabled={linkSocial.isPending}
															onClick={() => linkSocial.mutate(provider)}
															size="sm"
															variant="outline"
														>
															{linkSocial.isPending ? (
																<CircleNotchIcon className="mr-2 size-4 animate-spin" />
															) : (
																<LinkIcon className="mr-2 size-4" />
															)}
															Connect
														</Button>
													)}
												</div>
											);
										})}

										{hasCredentialAccount && (
											<div className="flex items-center justify-between py-2">
												<div className="flex items-center gap-3">
													<KeyIcon className="size-5" weight="duotone" />
													<span className="font-medium text-sm">Password</span>
												</div>
												<Badge variant="green">Connected</Badge>
											</div>
										)}
									</>
								)}
							</div>
						</section>
					</div>
				</div>

				<UnsavedChangesFooter
					hasChanges={hasChanges}
					isSaving={updateProfileMutation.isPending}
					onDiscard={handleDiscardChanges}
					onSave={handleSaveChanges}
				/>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Account Status">
					{isLoading ? (
						<div className="space-y-2.5">
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-full" />
						</div>
					) : (
						<div className="space-y-2.5">
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">
									Email verified
								</span>
								<Badge variant={user?.emailVerified ? "green" : "amber"}>
									{user?.emailVerified ? "Yes" : "No"}
								</Badge>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">
									2FA enabled
								</span>
								<Badge variant={user?.twoFactorEnabled ? "green" : "gray"}>
									{user?.twoFactorEnabled ? "Yes" : "No"}
								</Badge>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground text-sm">
									Member since
								</span>
								<span className="font-medium text-sm">
									{user?.createdAt
										? dayjs(user.createdAt).format("MMM YYYY")
										: "—"}
								</span>
							</div>
						</div>
					)}
				</RightSidebar.Section>

				<RightSidebar.Section border title="Connected Apps">
					{isAccountsLoading ? (
						<div className="space-y-2">
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-full" />
						</div>
					) : (
						<div className="space-y-2">
							{accounts.map((account) => {
								const config = PROVIDER_CONFIG[account.providerId];
								const ProviderIcon = config?.icon ?? KeyIcon;
								return (
									<div className="flex items-center gap-2" key={account.id}>
										<ProviderIcon className="size-4" weight="duotone" />
										<span className="flex-1 text-sm">
											{config?.name ?? account.providerId}
										</span>
										<span className="size-2 rounded-full bg-green-500" />
									</div>
								);
							})}
						</div>
					)}
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Keep your email up to date to ensure you receive important notifications about your account." />
				</RightSidebar.Section>
			</RightSidebar>

			{/* Dialogs */}
			<ChangePasswordDialog
				onOpenChange={setShowPasswordDialog}
				open={showPasswordDialog}
			/>
			<TwoFactorDialog
				hasCredentialAccount={hasCredentialAccount}
				isEnabled={user?.twoFactorEnabled ?? false}
				onOpenChange={setShowTwoFactorDialog}
				onSuccess={() => {
					queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
					queryClient.invalidateQueries({ queryKey: ["user-accounts"] });
				}}
				open={showTwoFactorDialog}
			/>
			<DeleteDialog
				confirmLabel="Unlink"
				description={`Are you sure you want to unlink your ${unlinkProvider ? PROVIDER_CONFIG[unlinkProvider]?.name : ""} account? You can reconnect it later.`}
				isDeleting={unlinkAccount.isPending}
				isOpen={!!unlinkProvider}
				onClose={() => setUnlinkProvider(null)}
				onConfirm={() => {
					if (unlinkProvider) {
						unlinkAccount.mutate(unlinkProvider, {
							onSuccess: () => setUnlinkProvider(null),
						});
					}
				}}
				title="Unlink Account"
			/>
		</div>
	);
}
