'use client';

import {
	BuildingsIcon,
	CaretLeftIcon,
	ChartBarIcon,
	CheckIcon,
	GearIcon,
	GlobeIcon,
	KeyIcon,
	UsersIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { lazy, Suspense } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
	type OrganizationsError,
	useOrganizations,
} from '@/hooks/use-organizations';
import { getOrganizationInitials } from '@/lib/utils';

// Dynamic imports
const OverviewTab = lazy(() =>
	import('./components/overview-tab').then((mod) => ({
		default: mod.OverviewTab,
	}))
);

const TeamsTab = lazy(() =>
	import('./components/teams-tab').then((mod) => ({
		default: mod.TeamsTab,
	}))
);

const SettingsTab = lazy(() =>
	import('./components/settings-tab').then((mod) => ({
		default: mod.SettingsTab,
	}))
);

function ComponentSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-32 w-full rounded" />
			<Skeleton className="h-48 w-full rounded" />
		</div>
	);
}

function PageSkeleton() {
	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
				<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-4">
							<Skeleton className="h-16 w-16 rounded-full" />
							<div>
								<Skeleton className="h-8 w-48" />
								<Skeleton className="mt-1 h-4 w-64" />
							</div>
						</div>
					</div>
					<Skeleton className="h-9 w-32" />
				</div>
			</div>
			<main className="flex-1 overflow-y-auto p-4 sm:p-6">
				<ComponentSkeleton />
			</main>
		</div>
	);
}

function SetActiveButton({
	onSetActive,
	isSettingActive,
	isCurrentlyActive,
}: {
	onSetActive: () => void;
	isSettingActive: boolean;
	isCurrentlyActive: boolean;
}) {
	if (isCurrentlyActive) {
		return (
			<Badge
				className="border-primary/20 bg-primary/10 text-primary"
				variant="secondary"
			>
				<CheckIcon className="mr-1 h-3 w-3" size={16} />
				Active Workspace
			</Badge>
		);
	}

	return (
		<Button
			className="rounded"
			disabled={isSettingActive}
			onClick={onSetActive}
			size="sm"
		>
			{isSettingActive ? (
				<>
					<div className="mr-2 h-3 w-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
					Switching...
				</>
			) : (
				<>
					<CheckIcon className="mr-2 h-4 w-4" size={16} />
					Set as Active
				</>
			)}
		</Button>
	);
}

function OrganizationNotFound() {
	return (
		<div className="py-12 text-center">
			<div className="mx-auto max-w-md rounded border border-border/50 bg-muted/30 p-6">
				<div className="mx-auto mb-4 w-fit rounded-full border border-destructive/20 bg-destructive/10 p-4">
					<BuildingsIcon
						className="h-8 w-8 text-destructive"
						size={32}
						weight="duotone"
					/>
				</div>
				<h3 className="mb-2 font-semibold text-lg">Organization Not Found</h3>
				<p className="mb-6 text-muted-foreground text-sm">
					The organization you're looking for doesn't exist or you don't have
					access to it.
				</p>
				<Button asChild className="rounded">
					<Link href="/organizations">
						<CaretLeftIcon
							className="mr-2 h-4 w-4 not-dark:text-primary"
							size={16}
						/>
						Back to Organizations
					</Link>
				</Button>
			</div>
		</div>
	);
}

function ErrorDisplay({
	onRetry,
	error,
}: {
	onRetry: () => void;
	error: OrganizationsError;
}) {
	return (
		<div className="py-12 text-center">
			<div className="mx-auto max-w-md rounded border border-border/50 bg-muted/30 p-6">
				<div className="mx-auto mb-4 w-fit rounded-full border border-destructive/20 bg-destructive/10 p-4">
					<BuildingsIcon
						className="h-8 w-8 text-destructive"
						size={32}
						weight="duotone"
					/>
				</div>
				<h3 className="mb-2 font-semibold text-destructive text-lg">
					Failed to load organization
				</h3>
				<p className="mb-6 text-muted-foreground text-sm">
					{error?.message ||
						'An error occurred while fetching organization data.'}
				</p>
				<Button className="rounded" onClick={onRetry}>
					<CaretLeftIcon className="mr-2 h-4 w-4" size={16} />
					Retry
				</Button>
			</div>
		</div>
	);
}

export default function OrganizationPage() {
	const params = useParams();
	const searchParams = useSearchParams();
	const slug = params.slug as string;

	// Get current view from URL parameters
	const tab = searchParams.get('tab') || 'overview';
	const settings = searchParams.get('settings');

	const {
		organizations,
		activeOrganization,
		setActiveOrganization,
		isSettingActiveOrganization,
		isLoading,
		hasError,
		organizationsError,
	} = useOrganizations();

	if (isLoading) {
		return <PageSkeleton />;
	}

	if (hasError) {
		return (
			<div className="container mx-auto max-w-6xl px-4 py-6">
				<ErrorDisplay
					error={organizationsError}
					onRetry={() => window.location.reload()}
				/>
			</div>
		);
	}

	const organization = organizations?.find((org) => org.slug === slug);
	if (!organization) {
		return (
			<div className="container mx-auto max-w-6xl px-4 py-6">
				<OrganizationNotFound />
			</div>
		);
	}

	const isCurrentlyActive = activeOrganization?.id === organization?.id;
	const handleSetActive = () => {
		if (organization && !isCurrentlyActive) {
			setActiveOrganization(organization.id);
		}
	};

	const getPageTitle = () => {
		if (tab === 'settings' && settings) {
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
						icon: GlobeIcon,
					};
				case 'apikeys':
					return {
						title: 'API Keys',
						description: 'Create and manage organization API keys',
						icon: KeyIcon,
					};
				case 'danger':
					return {
						title: 'Danger Zone',
						description: 'Delete organization and transfer assets',
						icon: WarningIcon,
					};
				default:
					return {
						title: 'Organization Settings',
						description: 'Configure your organization settings',
						icon: GearIcon,
					};
			}
		}

		switch (tab) {
			case 'teams':
				return {
					title: 'Teams',
					description: 'Manage team members and collaboration',
					icon: UsersIcon,
				};
			case 'settings':
				return {
					title: 'Settings',
					description: 'Configure organization settings',
					icon: GearIcon,
				};
			default:
				return {
					title: 'Overview',
					description: 'Organization dashboard and quick stats',
					icon: ChartBarIcon,
				};
		}
	};

	const { title, description, icon: Icon } = getPageTitle();

	return (
		<div className="flex h-full flex-col">
			<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
				<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
					<div className="min-w-0 flex-1">
						<div className="mb-3">
							<Button
								asChild
								className="group cursor-pointer text-muted-foreground hover:text-foreground"
								size="sm"
								variant="ghost"
							>
								<Link href="/organizations">
									<CaretLeftIcon
										className="group-hover:-translate-x-0.5 mr-2 h-4 w-4 transition-transform"
										size={16}
									/>
									<span>Back to Organizations</span>
								</Link>
							</Button>
						</div>
						<div className="flex items-center gap-4">
							<Avatar className="h-16 w-16 border border-border/50">
								<AvatarImage
									alt={organization.name}
									src={organization.logo || undefined}
								/>
								<AvatarFallback className="bg-accent font-medium text-lg">
									{getOrganizationInitials(organization.name)}
								</AvatarFallback>
							</Avatar>
							<div>
								<div className="flex items-center gap-3">
									<h1 className="truncate font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
										{organization.name}
									</h1>
									{isCurrentlyActive && (
										<Badge
											className="bg-primary/10 text-primary"
											variant="secondary"
										>
											<CheckIcon className="mr-1 h-3 w-3" size={16} />
											Active
										</Badge>
									)}
								</div>
								<p className="mt-1 text-muted-foreground text-sm sm:text-base">
									{organization.slug} • Created{' '}
									{new Date(organization.createdAt).toLocaleDateString()}
								</p>
								<div className="mt-2 flex items-center gap-2">
									<Icon
										className="h-4 w-4 text-primary"
										size={16}
										weight="duotone"
									/>
									<span className="text-muted-foreground text-sm">
										{title}: {description}
									</span>
								</div>
							</div>
						</div>
					</div>
					<SetActiveButton
						isCurrentlyActive={isCurrentlyActive}
						isSettingActive={isSettingActiveOrganization}
						onSetActive={handleSetActive}
					/>
				</div>
			</div>

			<main className="flex-1 overflow-y-auto p-4 sm:p-6">
				<div className="mx-auto max-w-6xl">
					{/* Content based on current view */}
					{tab === 'overview' && (
						<Suspense fallback={<ComponentSkeleton />}>
							<OverviewTab organization={organization} />
						</Suspense>
					)}

					{tab === 'teams' && (
						<Suspense fallback={<ComponentSkeleton />}>
							<TeamsTab organization={organization} />
						</Suspense>
					)}

					{tab === 'settings' && (
						<Suspense fallback={<ComponentSkeleton />}>
							<SettingsTab organization={organization} />
						</Suspense>
					)}
				</div>
			</main>
		</div>
	);
}
