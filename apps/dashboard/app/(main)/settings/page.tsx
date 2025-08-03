'use client';

import {
	BellIcon,
	GearSixIcon,
	ShieldIcon,
	UserIcon,
} from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { useQueryState } from 'nuqs';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { type NavItem, SettingsSidebar } from './_components/settings-sidebar';

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

type SettingsTab = 'profile' | 'account' | 'security' | 'notifications';

const tabs: NavItem[] = [
	{
		id: 'profile',
		label: 'Profile',
		icon: UserIcon,
	},
	{
		id: 'account',
		label: 'Account',
		icon: GearSixIcon,
	},
	{
		id: 'security',
		label: 'Security',
		icon: ShieldIcon,
	},
	{
		id: 'notifications',
		label: 'Notifications',
		icon: BellIcon,
		disabled: true,
	},
];

export default function SettingsPage() {
	const [activeTab, setActiveTab] = useQueryState('tab', {
		defaultValue: 'profile' as SettingsTab,
	});

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
									Settings
								</h1>
								<p className="mt-1 text-muted-foreground text-sm sm:text-base">
									Manage your account and preferences
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Mobile Tab Nav */}
			<div className="border-b sm:hidden">
				<div className="flex overflow-x-auto p-4">
					<div className="flex min-w-full gap-2">
						{tabs.map((item) => (
							<Button
								className="flex-shrink-0 whitespace-nowrap"
								disabled={item.disabled}
								key={item.id}
								onClick={() => setActiveTab(item.id)}
								size="sm"
								variant={activeTab === item.id ? 'secondary' : 'ghost'}
							>
								<item.icon className="mr-2 h-4 w-4" />
								{item.label}
							</Button>
						))}
					</div>
				</div>
			</div>

			<div className="flex flex-1 overflow-hidden">
				<aside className="hidden w-56 flex-shrink-0 border-r p-4 pr-6 sm:block">
					<SettingsSidebar
						activeTab={activeTab}
						items={tabs}
						setActiveTab={setActiveTab}
					/>
				</aside>
				<main className="flex-1 overflow-y-auto p-4 sm:p-6">
					{activeTab === 'profile' && (
						<Card className="shadow-sm">
							<CardHeader>
								<CardTitle className="text-2xl">Profile</CardTitle>
								<CardDescription>
									This information will be displayed on your public profile.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ProfileForm />
							</CardContent>
						</Card>
					)}
					{activeTab === 'account' && (
						<Card className="shadow-sm">
							<CardHeader>
								<CardTitle className="text-2xl">Account Settings</CardTitle>
								<CardDescription>
									Manage your email, password, and other account settings.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-8">
								<div>
									<h3 className="font-semibold text-lg tracking-tight">
										Email Address
									</h3>
									<p className="mt-1 text-muted-foreground text-sm">
										Update your email address and manage email preferences.
									</p>
									<div className="mt-4">
										<EmailForm />
									</div>
								</div>
								<div className="border-t pt-8">
									<h3 className="font-semibold text-lg tracking-tight">
										Password
									</h3>
									<p className="mt-1 text-muted-foreground text-sm">
										Change your password to keep your account secure.
									</p>
									<div className="mt-4">
										<PasswordForm />
									</div>
								</div>
								<div className="border-t pt-8">
									<h3 className="font-semibold text-lg tracking-tight">
										Timezone
									</h3>
									<p className="mt-1 text-muted-foreground text-sm">
										Set your timezone for accurate date and time display.
									</p>
									<div className="mt-4">
										<TimezonePreferences />
									</div>
								</div>
								<div className="border-destructive/50 border-t pt-8">
									<h3 className="font-semibold text-destructive text-lg tracking-tight">
										Delete Account
									</h3>
									<p className="mt-1 text-muted-foreground text-sm">
										Permanently delete your account and all associated data.
										This action cannot be undone.
									</p>
									<div className="mt-4">
										<AccountDeletion />
									</div>
								</div>
							</CardContent>
						</Card>
					)}
					{activeTab === 'security' && (
						<Card className="shadow-sm">
							<CardHeader>
								<CardTitle className="text-2xl">Security Settings</CardTitle>
								<CardDescription>
									Manage your account's security, including two-factor
									authentication and active sessions.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-col gap-8">
								<div>
									<h3 className="font-semibold text-lg tracking-tight">
										Two-Factor Authentication
									</h3>
									<p className="mt-1 text-muted-foreground text-sm">
										Add an additional layer of security to your account by
										enabling 2FA.
									</p>
									<div className="mt-4">
										<TwoFactorForm />
									</div>
								</div>
								<div className="border-t pt-8">
									<h3 className="font-semibold text-lg tracking-tight">
										Active Sessions
									</h3>
									<p className="mt-1 text-muted-foreground text-sm">
										Manage your active sessions and log out from other devices.
									</p>
									<div className="mt-4">
										<SessionsForm />
									</div>
								</div>
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
		</div>
	);
}
