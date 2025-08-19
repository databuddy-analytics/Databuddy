'use client';

import { BellIcon, GearSixIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApiKeyDetailDialog } from '@/components/organizations/api-key-detail-dialog';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiKeyCreateDialog, ApiKeyList } from './_components';

const EmailForm = dynamic(
	() =>
		import('./_components/email-form').then((mod) => ({
			default: mod.EmailForm,
		})),
	{
		loading: () => <Skeleton className="h-32 w-full rounded" />,
		ssr: false,
	}
);

const PasswordForm = dynamic(
	() =>
		import('./_components/password-form').then((mod) => ({
			default: mod.PasswordForm,
		})),
	{
		loading: () => <Skeleton className="h-40 w-full rounded" />,
		ssr: false,
	}
);

const TwoFactorForm = dynamic(
	() =>
		import('./_components/two-factor-form').then((mod) => ({
			default: mod.TwoFactorForm,
		})),
	{
		loading: () => <Skeleton className="h-48 w-full rounded" />,
		ssr: false,
	}
);

const SessionsForm = dynamic(
	() =>
		import('./_components/sessions-form').then((mod) => ({
			default: mod.SessionsForm,
		})),
	{
		loading: () => <Skeleton className="h-64 w-full rounded" />,
		ssr: false,
	}
);

const AccountDeletion = dynamic(
	() =>
		import('./_components/account-deletion').then((mod) => ({
			default: mod.AccountDeletion,
		})),
	{
		loading: () => <Skeleton className="h-24 w-full rounded" />,
		ssr: false,
	}
);

const ProfileForm = dynamic(
	() =>
		import('./_components/profile-form').then((mod) => ({
			default: mod.ProfileForm,
		})),
	{
		loading: () => <Skeleton className="h-56 w-full rounded" />,
		ssr: false,
	}
);

const TimezonePreferences = dynamic(
	() =>
		import('./_components/timezone-preferences').then((mod) => ({
			default: mod.TimezonePreferences,
		})),
	{
		loading: () => <Skeleton className="h-20 w-full rounded" />,
		ssr: false,
	}
);

export default function SettingsPage() {
	const searchParams = useSearchParams();
	const activeTab = searchParams.get('tab') || 'profile';

	const getPageTitle = () => {
		switch (activeTab) {
			case 'profile':
				return {
					title: 'Profile',
					description: 'Manage your personal information and preferences',
				};
			case 'account':
				return {
					title: 'Account',
					description: 'Update your email, password, and account settings',
				};
			case 'security':
				return {
					title: 'Security',
					description:
						'Manage your security settings and two-factor authentication',
				};
			case 'api-keys':
				return {
					title: 'API Keys',
					description: 'Create and manage API keys for integrations',
				};
			default:
				return {
					title: 'Settings',
					description: 'Manage your account and preferences',
				};
		}
	};

	const { title, description } = getPageTitle();

	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
				<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-4">
							<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
								<GearSixIcon
									className="h-6 w-6 text-primary"
									size={24}
									weight="duotone"
								/>
							</div>
							<div>
								<h1 className="truncate font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
									{title}
								</h1>
								<p className="mt-1 text-muted-foreground text-sm sm:text-base">
									{description}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			<main className="flex-1 overflow-y-auto p-4 sm:p-6">
				{activeTab === 'profile' && (
					<Card className="shadow-sm">
						<CardContent className="pt-6">
							<ProfileForm />
						</CardContent>
					</Card>
				)}
				{activeTab === 'account' && (
					<div className="space-y-6">
						<Card className="shadow-sm">
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

						<Card className="shadow-sm">
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

						<Card className="shadow-sm">
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

						<Card className="border-destructive/20 shadow-sm">
							<CardHeader>
								<CardTitle className="text-destructive">
									Delete Account
								</CardTitle>
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
				{activeTab === 'security' && (
					<div className="space-y-6">
						<Card className="shadow-sm">
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

						<Card className="shadow-sm">
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
				{activeTab === 'api-keys' && (
					<Card className="shadow-sm">
						<CardContent className="pt-6">
							<ApiKeysSection />
						</CardContent>
					</Card>
				)}
				{activeTab === 'notifications' && (
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
		<div className="space-y-4">
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
				onOpenChange={setOpen}
				open={open}
			/>
			<ApiKeyDetailDialog
				keyId={selectedId}
				onOpenChange={(o) => {
					if (!o) {
						setSelectedId(null);
					}
				}}
				open={!!selectedId}
			/>
		</div>
	);
}
