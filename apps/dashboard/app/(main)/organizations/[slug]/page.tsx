'use client';

import {
	BuildingsIcon,
	CaretLeftIcon,
	ChartBarIcon,
	CheckIcon,
	GearIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQueryState } from 'nuqs';
import { Suspense } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
	type Organization,
	type OrganizationsError,
	useOrganizations,
} from '@/hooks/use-organizations';
import { getOrganizationInitials } from '@/lib/utils';
import { OrganizationPageSkeleton } from './components/organization-page-skeleton';
import { OverviewTab } from './components/overview-tab';
import { SettingsTab } from './components/settings-tab';
import { TeamsTab } from './components/teams-tab';

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

interface PageHeaderProps {
	organization: Organization;
	isCurrentlyActive: boolean;
	onSetActive: () => void;
	isSettingActive: boolean;
}

function PageHeader({
	organization,
	isCurrentlyActive,
	onSetActive,
	isSettingActive,
}: PageHeaderProps) {
	return (
		<div className="rounded border border-border/50 bg-muted/30 p-6">
			<div className="flex items-center justify-between">
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
						<div className="mb-2 flex items-center gap-3">
							<h1 className="font-bold text-2xl">{organization.name}</h1>
						</div>
						<p className="text-muted-foreground text-sm">
							{organization.slug} • Created{' '}
							{new Date(organization.createdAt).toLocaleDateString()}
						</p>
					</div>
				</div>
				<SetActiveButton
					isCurrentlyActive={isCurrentlyActive}
					isSettingActive={isSettingActive}
					onSetActive={onSetActive}
				/>
			</div>
		</div>
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
						<CaretLeftIcon className="mr-2 h-4 w-4" size={16} />
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
	const slug = params.slug as string;
	const [activeTab, setActiveTab] = useQueryState('tab', {
		defaultValue: 'overview',
	});

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
		return <OrganizationPageSkeleton />;
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

	return (
		<div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
			<div>
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

			<PageHeader
				isCurrentlyActive={isCurrentlyActive}
				isSettingActive={isSettingActiveOrganization}
				onSetActive={handleSetActive}
				organization={organization}
			/>

			<Tabs
				className="space-y-4"
				onValueChange={setActiveTab}
				value={activeTab}
			>
				<div className="relative border-b">
					<TabsList className="h-10 w-full justify-start overflow-x-auto bg-transparent p-0">
						<TabsTrigger
							className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm"
							value="overview"
						>
							<ChartBarIcon className="mr-1 h-3 w-3" size={16} />
							<span className="hidden sm:inline">Overview</span>
							{activeTab === 'overview' && (
								<div className="absolute bottom-0 left-0 h-[2px] w-full rounded bg-primary" />
							)}
						</TabsTrigger>
						<TabsTrigger
							className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm"
							value="teams"
						>
							<UsersIcon className="mr-1 h-3 w-3" size={16} />
							<span className="hidden sm:inline">Teams</span>
							{activeTab === 'teams' && (
								<div className="absolute bottom-0 left-0 h-[2px] w-full rounded bg-primary" />
							)}
						</TabsTrigger>
						<TabsTrigger
							className="relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm"
							value="settings"
						>
							<GearIcon className="mr-1 h-3 w-3" size={16} />
							<span className="hidden sm:inline">Settings</span>
							{activeTab === 'settings' && (
								<div className="absolute bottom-0 left-0 h-[2px] w-full rounded bg-primary" />
							)}
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent
					className="animate-fadeIn transition-all duration-200"
					value="overview"
				>
					<Suspense fallback={<OrganizationPageSkeleton />}>
						<OverviewTab organization={organization} />
					</Suspense>
				</TabsContent>

				<TabsContent
					className="animate-fadeIn transition-all duration-200"
					value="teams"
				>
					<Suspense fallback={<OrganizationPageSkeleton />}>
						<TeamsTab organization={organization} />
					</Suspense>
				</TabsContent>

				<TabsContent
					className="animate-fadeIn transition-all duration-200"
					value="settings"
				>
					<Suspense fallback={<OrganizationPageSkeleton />}>
						<SettingsTab organization={organization} />
					</Suspense>
				</TabsContent>
			</Tabs>
		</div>
	);
}
