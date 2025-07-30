'use client';

import {
	ArrowRightIcon,
	BuildingsIcon,
	CheckIcon,
	GearIcon,
	PlusIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import { Suspense, useState } from 'react';
import { CreateOrganizationDialog } from '@/components/organizations/create-organization-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
	type ActiveOrganization,
	type Organization,
	useOrganizations,
} from '@/hooks/use-organizations';
import { cn } from '@/lib/utils';
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
			<Skeleton className="h-32 w-full rounded-lg" />
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

function TabSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-32 w-full rounded" />
			<Skeleton className="h-48 w-full rounded" />
		</div>
	);
}

// Dynamic imports for tab components
const OrganizationsTab = dynamic(
	() =>
		import('./components/organizations-tab').then((mod) => ({
			default: mod.OrganizationsTab,
		})),
	{
		loading: () => <TabSkeleton />,
		ssr: false,
	}
);

const TeamsTab = dynamic(
	() =>
		import('./[slug]/components/teams-tab').then((mod) => ({
			default: mod.TeamsTab,
		})),
	{
		loading: () => <TabSkeleton />,
		ssr: false,
	}
);

/**
 * Displays a banner indicating the current workspace context, showing either personal mode or the active organization.
 *
 * If no organization is active, shows a warning banner for personal workspace with an optional organization switcher. If an organization is active, displays its name, an "Active" badge, organization count, a switcher, and a settings link.
 *
 * @param activeOrg - The currently active organization, or `null`/`undefined` for personal mode.
 * @param organizations - List of all available organizations.
 */
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
							<a href={`/organizations/${activeOrg.slug}`}>
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

// Sub-components
function PageHeader({ onNewOrg }: { onNewOrg: () => void }) {
	return (
		<div className="flex items-center justify-between">
			<div>
				<h1 className="font-bold text-2xl">Organizations</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Manage your organizations and team collaboration
				</p>
			</div>
			<Button className="rounded" onClick={onNewOrg} size="sm">
				<PlusIcon className="mr-2 h-4 w-4" size={16} />
				New Organization
			</Button>
		</div>
	);
}

/**
 * Displays summary statistics for organizations, current workspace, and mode.
 *
 * Shows the total number of organizations, the name of the active organization or "Personal" if none is selected, and indicates whether the user is in Team Mode or Personal Mode.
 *
 * @param orgCount - The total number of organizations
 * @param activeOrg - The currently active organization, or undefined for personal workspace
 */
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

/**
 * Renders the main content area with tabs for managing organizations and teams.
 *
 * Displays quick statistics, a tab list for switching between "Organizations" and "Teams," and dynamically loads the corresponding tab content. The "Teams" tab is disabled if no active organization is selected.
 *
 * @param organizations - The list of available organizations
 * @param activeOrganization - The currently selected active organization
 * @param isLoading - Indicates if organization data is loading
 * @param onNewOrg - Callback invoked when creating a new organization
 */
function MainView({
	organizations,
	activeOrganization,
	isLoading,
	onNewOrg,
}: {
	organizations: Organization[];
	activeOrganization: ActiveOrganization;
	isLoading: boolean;
	onNewOrg: () => void;
}) {
	const [activeTab, setActiveTab] = useState('organizations');

	return (
		<>
			<QuickStats
				activeOrg={activeOrganization}
				orgCount={organizations.length}
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
							value="organizations"
						>
							<BuildingsIcon className="mr-1 h-3 w-3" size={16} />
							<span className="hidden sm:inline">Organizations</span>
							{activeTab === 'organizations' && (
								<div className="absolute bottom-0 left-0 h-[2px] w-full rounded bg-primary" />
							)}
						</TabsTrigger>
						<TabsTrigger
							className={cn(
								'relative h-10 cursor-pointer touch-manipulation whitespace-nowrap rounded-none px-2 text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:text-sm',
								!activeOrganization && 'cursor-not-allowed opacity-50'
							)}
							disabled={!activeOrganization}
							value="teams"
						>
							<UsersIcon className="mr-1 h-3 w-3" size={16} />
							<span className="hidden sm:inline">Teams</span>
							{activeTab === 'teams' && (
								<div className="absolute bottom-0 left-0 h-[2px] w-full rounded bg-primary" />
							)}
						</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent
					className="animate-fadeIn transition-all duration-200"
					value="organizations"
				>
					<Suspense fallback={<TabSkeleton />}>
						<OrganizationsTab
							activeOrganization={activeOrganization}
							isLoading={isLoading}
							onCreateOrganization={onNewOrg}
							organizations={organizations}
						/>
					</Suspense>
				</TabsContent>
				<TabsContent
					className="animate-fadeIn transition-all duration-200"
					value="teams"
				>
					<Suspense fallback={<TabSkeleton />}>
						<TeamsTab organization={activeOrganization} />
					</Suspense>
				</TabsContent>
			</Tabs>
		</>
	);
}

// Main page component
export default function OrganizationsPage() {
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const { organizations, activeOrganization, isLoading } = useOrganizations();

	if (isLoading) {
		return (
			<div className="container mx-auto max-w-6xl px-4 py-6">
				<PageSkeleton />
			</div>
		);
	}

	return (
		<div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
			<PageHeader onNewOrg={() => setShowCreateDialog(true)} />

			{/* Active Organization Banner */}
			<ActiveOrganizationBanner
				activeOrg={activeOrganization}
				organizations={organizations}
			/>

			<MainView
				activeOrganization={activeOrganization}
				isLoading={isLoading}
				onNewOrg={() => setShowCreateDialog(true)}
				organizations={organizations}
			/>

			<CreateOrganizationDialog
				isOpen={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
			/>
		</div>
	);
}
