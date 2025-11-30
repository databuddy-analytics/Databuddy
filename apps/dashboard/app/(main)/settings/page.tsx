"use client";

import {
	BellIcon,
	GearIcon,
	IdentificationCardIcon,
	KeyIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ApiKeyDetailDialog } from "@/components/organizations/api-key-detail-dialog";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../websites/_components/page-header";
import { ApiKeyCreateDialog, ApiKeyList } from "./_components";

const EmailForm = dynamic(
	() =>
		import("./_components/email-form").then((mod) => ({
			default: mod.EmailForm,
		})),
	{
		loading: () => <Skeleton className="h-32 w-full rounded" />,
		ssr: false,
	}
);

const PasswordForm = dynamic(
	() =>
		import("./_components/password-form").then((mod) => ({
			default: mod.PasswordForm,
		})),
	{
		loading: () => <Skeleton className="h-40 w-full rounded" />,
		ssr: false,
	}
);

const TwoFactorForm = dynamic(
	() =>
		import("./_components/two-factor-form").then((mod) => ({
			default: mod.TwoFactorForm,
		})),
	{
		loading: () => <Skeleton className="h-48 w-full rounded" />,
		ssr: false,
	}
);

const SessionsForm = dynamic(
	() =>
		import("./_components/sessions-form").then((mod) => ({
			default: mod.SessionsForm,
		})),
	{
		loading: () => <Skeleton className="h-64 w-full rounded" />,
		ssr: false,
	}
);

const AccountDeletion = dynamic(
	() =>
		import("./_components/account-deletion").then((mod) => ({
			default: mod.AccountDeletion,
		})),
	{
		loading: () => <Skeleton className="h-24 w-full rounded" />,
		ssr: false,
	}
);

const ProfileForm = dynamic(
	() =>
		import("./_components/profile-form").then((mod) => ({
			default: mod.ProfileForm,
		})),
	{
		loading: () => <Skeleton className="h-56 w-full rounded" />,
		ssr: false,
	}
);

const TimezonePreferences = dynamic(
	() =>
		import("./_components/timezone-preferences").then((mod) => ({
			default: mod.TimezonePreferences,
		})),
	{
		loading: () => <Skeleton className="h-20 w-full rounded" />,
		ssr: false,
	}
);

export default function SettingsPage() {
	const searchParams = useSearchParams();
	const activeTab = searchParams.get("tab") || "profile";

	const getPageTitle = () => {
		switch (activeTab) {
			case "profile":
				return {
					title: "Profile",
					description: "Manage your personal information and preferences",
					icon: <IdentificationCardIcon />,
				};
			case "account":
				return {
					title: "Account",
					description: "Update your email, password, and account settings",
					icon: <GearIcon />,
				};
			case "security":
				return {
					title: "Security",
					description:
						"Manage your security settings and two-factor authentication",
					icon: <ShieldCheckIcon />,
				};
			case "api-keys":
				return {
					title: "API Keys",
					description: "Create and manage API keys for your applications",
					icon: <KeyIcon />,
				};
			default:
				return {
					title: "Settings",
					description: "Manage your account and preferences",
					icon: <GearIcon />,
				};
		}
	};

	const { title, description, icon } = getPageTitle();

	return (
		<div className="flex h-full flex-col">
			<PageHeader description={description} icon={icon} title={title} />
			<main className="flex-1 overflow-y-auto p-4">
				{activeTab === "profile" && (
					<Card>
						<CardContent>
							<ProfileForm />
						</CardContent>
					</Card>
				)}
				{activeTab === "account" && (
					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Email Address</CardTitle>
								<CardDescription>
									Update your email address and manage email preferences.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<EmailForm />
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Password</CardTitle>
								<CardDescription>
									Change your password to keep your account secure.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<PasswordForm />
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Timezone</CardTitle>
								<CardDescription>
									Set your timezone for accurate date and time display.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<TimezonePreferences />
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Delete Account</CardTitle>
								<CardDescription>
									Permanently delete your account and all associated data. This
									action cannot be undone.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<AccountDeletion />
							</CardContent>
						</Card>
					</div>
				)}
				{activeTab === "security" && (
					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle>Two-Factor Authentication</CardTitle>
								<CardDescription>
									Add an additional layer of security to your account by
									enabling 2FA.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<TwoFactorForm />
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Active Sessions</CardTitle>
								<CardDescription>
									Manage your active sessions and log out from other devices.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<SessionsForm />
							</CardContent>
						</Card>
					</div>
				)}
				{activeTab === "api-keys" && <ApiKeysSection />}
				{activeTab === "notifications" && (
					<div className="flex h-full items-center justify-center">
						<div className="text-center">
							<BellIcon className="mx-auto h-12 w-12 text-muted-foreground" />
							<h3 className="mt-2 font-medium text-foreground text-sm">
								No new notifications
							</h3>
							<p className="mt-1 text-muted-foreground text-sm">
								You're all caught up! Check back later.
							</p>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}

function ApiKeysSection() {
	const [open, setOpen] = useState(false);
	const [createdSecret, setCreatedSecret] = useState<null | {
		id: string;
		secret: string;
		prefix: string;
		start: string;
	}>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	return (
		<div className="h-full space-y-4">
			<ApiKeyList
				onCreateNew={() => setOpen(true)}
				onSelect={(id) => setSelectedId(id)}
			/>
			{createdSecret && (
				<div className="rounded border p-3 text-sm">
					<div className="mb-1 font-medium">Copy your secret now</div>
					<code className="block break-all">{createdSecret.secret}</code>
				</div>
			)}
			<ApiKeyCreateDialog
				onCreated={(res) => setCreatedSecret(res)}
				onOpenChange={(o) => setOpen(o)}
				open={open}
			/>
			<ApiKeyDetailDialog
				keyId={selectedId}
				onOpenChangeAction={(o) => {
					if (!o) {
						setSelectedId(null);
					}
				}}
				open={!!selectedId}
			/>
		</div>
	);
}
