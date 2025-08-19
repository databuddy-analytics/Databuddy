'use client';

import {
	BuildingsIcon,
	CheckIcon,
	ClockIcon,
	GearIcon,
	KeyIcon,
	PlusIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { lazy, Suspense, useState } from 'react';
import { CreateOrganizationDialog } from '@/components/organizations/create-organization-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
	type ActiveOrganization,
	type Organization,
	useOrganizations,
} from '@/hooks/use-organizations';
import { OrganizationSwitcher } from './components/organization-switcher';

// Skeletons
function PageSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<Skeleton className="h-7 w-48" />
					<Skeleton className="h-4 w-64" />
				</div>
				<Skeleton className="h-9 w-40" />
			</div>
			<Skeleton className="h-32 w-full rounded" />
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-24 w-full" />
			</div>
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		</div>
	);
}

function ComponentSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-32 w-full rounded" />
			<Skeleton className="h-48 w-full rounded" />
		</div>
	);
}

// Dynamic imports for components
const OrganizationsTab = lazy(() =>
	import('./components/organizations-tab').then((mod) => ({
		default: mod.OrganizationsTab,
	}))
);

const MembersOnlyView = lazy(() =>
	import('./components/members-only-view').then((mod) => ({
		default: mod.MembersOnlyView,
	}))
);

const InvitationsOnlyView = lazy(() =>
	import('./components/invitations-only-view').then((mod) => ({
		default: mod.InvitationsOnlyView,
	}))
);

const SettingsTab = lazy(() =>
	import('./[slug]/components/settings-tab').then((mod) => ({
		default: mod.SettingsTab,
	}))
);

// Active Organization Banner
function ActiveOrganizationBanner({
	activeOrg,
	organizations,
}: {
	activeOrg: ActiveOrganization;
	organizations: Organization[];
}) {
	if (!activeOrg) {
		return (
			<Card className="border-warning/20 bg-warning/5">
				<CardContent className="p-6">
					<div className="flex items-center gap-4">
						<div className="rounded-full bg-warning/10 p-3">
							<UsersIcon
								className="h-6 w-6 text-warning"
								size={24}
								weight="duotone"
							/>
						</div>
						<div className="flex-1">
							<h3 className="font-semibold text-lg">Personal Workspace</h3>
							<p className="text-muted-foreground text-sm">
								You're currently in personal mode. Create or switch to an
								organization for team collaboration.
							</p>
						</div>
						{organizations.length > 0 && (
							<OrganizationSwitcher
								activeOrganization={activeOrg}
								organizations={organizations}
							/>
						)}
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="border-primary/20 bg-primary/5">
			<CardContent className="p-6">
				<div className="flex items-center gap-4">
					<div className="rounded-full bg-primary/10 p-3">
						<BuildingsIcon
							className="h-6 w-6 text-primary"
							size={24}
							weight="duotone"
						/>
					</div>
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<h3 className="font-semibold text-lg">{activeOrg.name}</h3>
							<Badge className="bg-primary/10 text-primary" variant="secondary">
								<CheckIcon className="mr-1 h-3 w-3" size={16} />
								Active
							</Badge>
						</div>
						<p className="text-muted-foreground text-sm">
							Team workspace • {organizations.length} organization
							{organizations.length !== 1 ? 's' : ''} available
						</p>
					</div>
					<div className="flex items-center gap-2">
						<OrganizationSwitcher
							activeOrganization={activeOrg}
							organizations={organizations}
						/>
						<Button asChild className="rounded" size="sm" variant="outline">
							<a href={`/organizations/${activeOrg.slug}?tab=settings`}>
								<GearIcon className="mr-2 h-4 w-4" size={16} />
								Settings
							</a>
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function QuickStats({
	orgCount,
	activeOrg,
}: {
	orgCount: number;
	activeOrg: ActiveOrganization;
}) {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
			<div className="rounded border border-border/50 bg-muted/30 p-4">
				<div className="flex items-center gap-3">
					<div className="rounded border border-primary/20 bg-primary/10 p-2">
						<BuildingsIcon
							className="h-5 w-5 text-primary"
							size={16}
							weight="duotone"
						/>
					</div>
					<div>
						<p className="text-muted-foreground text-sm">Organizations</p>
						<p className="font-semibold text-xl">{orgCount}</p>
					</div>
				</div>
			</div>
			<div className="rounded border border-border/50 bg-muted/30 p-4">
				<div className="flex items-center gap-3">
					<div className="rounded border border-primary/20 bg-primary/10 p-2">
						<UsersIcon
							className="h-5 w-5 text-primary"
							size={16}
							weight="duotone"
						/>
					</div>
					<div>
						<p className="text-muted-foreground text-sm">Current Workspace</p>
						<p className="max-w-[120px] truncate font-medium text-sm">
							{activeOrg?.name || 'Personal'}
						</p>
					</div>
				</div>
			</div>
			<div className="rounded border border-border/50 bg-muted/30 p-4">
				<div className="flex items-center gap-3">
					<div className="rounded border border-primary/20 bg-primary/10 p-2">
						<GearIcon
							className="h-5 w-5 text-primary"
							size={16}
							weight="duotone"
						/>
					</div>
					<div>
						<p className="text-muted-foreground text-sm">Mode</p>
						<p className="font-medium text-sm">
							{activeOrg ? 'Team Mode' : 'Personal Mode'}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

// Main page component
export default function OrganizationsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const { organizations, activeOrganization, isLoading } = useOrganizations();

	// Get current view from URL parameters
	const tab = searchParams.get('tab');
	const view = searchParams.get('view');
	const settings = searchParams.get('settings');
	const action = searchParams.get('action');

	// Handle create organization action
	if (action === 'create' && !showCreateDialog) {
		setShowCreateDialog(true);
		// Remove action param from URL
		const newParams = new URLSearchParams(searchParams);
		newParams.delete('action');
		router.replace(`/organizations?${newParams.toString()}`);
	}

	const getPageTitle = () => {
		if (settings) {
			switch (settings) {
				case 'general':
					return {
						title: 'General Settings',
						description: 'Manage organization name, slug, and basic settings',
						icon: GearIcon,
					};
				case 'websites':
					return {
						title: 'Website Management',
						description: 'Manage websites and transfer assets',
						icon: BuildingsIcon,
					};
				case 'api-keys':
					return {
						title: 'API Keys',
						description: 'Create and manage organization API keys',
						icon: KeyIcon,
					};
				default:
					return {
						title: 'Organization Settings',
						description: 'Configure your organization settings',
						icon: GearIcon,
					};
			}
		}

		if (view) {
			switch (view) {
				case 'members':
					return {
						title: 'Team Members',
						description: 'Manage team members and their roles',
						icon: UsersIcon,
					};
				case 'invitations':
					return {
						title: 'Pending Invitations',
						description: 'View and manage pending team invitations',
						icon: ClockIcon,
					};
				default:
					return {
						title: 'Team Management',
						description: 'Manage your team and collaboration',
						icon: UsersIcon,
					};
			}
		}

		switch (tab) {
			case 'teams':
				return {
					title: 'All Teams',
					description: 'View and manage teams across organizations',
					icon: UsersIcon,
				};
			default:
				return {
					title: 'Organizations',
					description: 'Manage your organizations and team collaboration',
					icon: BuildingsIcon,
				};
		}
	};

	const { title, description, icon: Icon } = getPageTitle();

	if (isLoading) {
		return (
			<div className="flex h-full flex-col">
				<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
					<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-4">
								<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
									<Skeleton className="h-6 w-6" />
								</div>
								<div>
									<Skeleton className="h-8 w-48" />
									<Skeleton className="mt-1 h-4 w-64" />
								</div>
							</div>
						</div>
					</div>
				</div>
				<main className="flex-1 overflow-y-auto p-4 sm:p-6">
					<PageSkeleton />
				</main>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
				<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-4">
							<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
								<Icon
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
					<Button
						className="w-full rounded sm:w-auto"
						onClick={() => setShowCreateDialog(true)}
						size="sm"
					>
						<PlusIcon
							className="mr-2 h-4 w-4 not-dark:text-primary"
							size={16}
						/>
						New Organization
					</Button>
				</div>
			</div>

			<main className="flex-1 overflow-y-auto p-4 sm:p-6">
				<div className="mx-auto max-w-6xl">
					{!(tab || view || settings) && (
						<div className="mb-6 space-y-6">
							{/* Active Organization Banner */}
							<ActiveOrganizationBanner
								activeOrg={activeOrganization}
								organizations={organizations}
							/>

							{/* Quick Stats */}
							<QuickStats
								activeOrg={activeOrganization}
								orgCount={organizations.length}
							/>
						</div>
					)}

					{/* Content based on current view */}
					{/* Default organizations view */}
					{!(tab || view || settings) && (
						<Suspense fallback={<ComponentSkeleton />}>
							<OrganizationsTab
								activeOrganization={activeOrganization}
								isLoading={isLoading}
								onCreateOrganization={() => setShowCreateDialog(true)}
								organizations={organizations}
							/>
						</Suspense>
					)}

					{/* Organization overview (same as default but with explicit tab) */}
					{tab === 'organizations' && (
						<Suspense fallback={<ComponentSkeleton />}>
							<OrganizationsTab
								activeOrganization={activeOrganization}
								isLoading={isLoading}
								onCreateOrganization={() => setShowCreateDialog(true)}
								organizations={organizations}
							/>
						</Suspense>
					)}

					{/* Views that need individual organization context */}
					{(view === 'members' || view === 'invitations') &&
						!activeOrganization && (
							<Card className="p-6">
								<div className="text-center">
									<UsersIcon
										className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
										size={48}
										weight="duotone"
									/>
									<h3 className="mb-2 font-semibold text-lg">
										Select an Organization
									</h3>
									<p className="text-muted-foreground text-sm">
										Team management features require an active organization.
									</p>
									<div className="mt-4 flex items-center justify-center gap-2">
										<Button
											className="rounded"
											onClick={() => setShowCreateDialog(true)}
											size="sm"
										>
											Create organization
										</Button>
										<OrganizationSwitcher
											activeOrganization={activeOrganization}
											organizations={organizations}
										/>
									</div>
								</div>
							</Card>
						)}

					{/* Members only view */}
					{view === 'members' && activeOrganization && (
						<Suspense fallback={<ComponentSkeleton />}>
							<MembersOnlyView organization={activeOrganization} />
						</Suspense>
					)}

					{/* Invitations only view */}
					{view === 'invitations' && activeOrganization && (
						<Suspense fallback={<ComponentSkeleton />}>
							<InvitationsOnlyView organization={activeOrganization} />
						</Suspense>
					)}

					{/* Settings views - show actual content */}
					{settings && activeOrganization && (
						<Suspense fallback={<ComponentSkeleton />}>
							<SettingsTab organization={activeOrganization} />
						</Suspense>
					)}

					{/* Settings without active org */}
					{settings && !activeOrganization && (
						<Card className="p-6">
							<div className="text-center">
								<GearIcon
									className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
									size={48}
									weight="duotone"
								/>
								<h3 className="mb-2 font-semibold text-lg">
									Select an Organization
								</h3>
								<p className="text-muted-foreground text-sm">
									Organization settings require an active organization.
								</p>
								<div className="mt-4 flex items-center justify-center gap-2">
									<Button
										className="rounded"
										onClick={() => setShowCreateDialog(true)}
										size="sm"
									>
										Create organization
									</Button>
									<OrganizationSwitcher
										activeOrganization={activeOrganization}
										organizations={organizations}
									/>
								</div>
							</div>
						</Card>
					)}
				</div>
			</main>

			<CreateOrganizationDialog
				isOpen={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
			/>
		</div>
	);
}
