'use client';

import {
	CaretDownIcon,
	CheckIcon,
	PlusIcon,
	SpinnerGapIcon,
	UserIcon,
} from '@phosphor-icons/react';
import { useCallback, useState } from 'react';
import { CreateOrganizationDialog } from '@/components/organizations/create-organization-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganizations } from '@/hooks/use-organizations';
import { cn } from '@/lib/utils';

const getOrganizationInitials = (name: string) => {
	return name
		.split(' ')
		.map((n) => n[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
};

function filterOrganizations<T extends { name: string; slug?: string | null }>(
	orgs: T[] | undefined,
	query: string
): T[] {
	if (!orgs || orgs.length === 0) {
		return [];
	}
	if (!query) {
		return orgs;
	}
	const q = query.toLowerCase();
	const filtered: T[] = [];
	for (const org of orgs) {
		const nameMatch = org.name.toLowerCase().includes(q);
		const slugMatch = org.slug ? org.slug.toLowerCase().includes(q) : false;
		if (nameMatch || slugMatch) {
			filtered.push(org);
		}
	}
	return filtered;
}

interface OrganizationSelectorTriggerProps {
	activeOrganization: {
		name: string;
		slug?: string | null;
		logo?: string | null;
	} | null;
	isOpen: boolean;
	isSettingActiveOrganization: boolean;
}

function OrganizationSelectorTrigger({
	activeOrganization,
	isOpen,
	isSettingActiveOrganization,
}: OrganizationSelectorTriggerProps) {
	return (
		<div
			className={cn(
				'flex h-12 w-full items-center border-sidebar-border border-b bg-sidebar-accent px-3 py-3 transition-colors',
				'hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50',
				isSettingActiveOrganization && 'cursor-not-allowed opacity-70',
				isOpen && 'bg-sidebar-accent/60'
			)}
		>
			<div className="flex w-full items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="rounded-lg bg-sidebar/80 p-1.5 shadow-sm ring-1 ring-sidebar-border/50">
						<Avatar className="h-5 w-5">
							<AvatarImage
								alt={activeOrganization?.name || 'Personal'}
								src={activeOrganization?.logo || undefined}
							/>
							<AvatarFallback className="bg-transparent font-medium text-xs">
								{activeOrganization?.name ? (
									getOrganizationInitials(activeOrganization.name)
								) : (
									<UserIcon
										className="text-sidebar-ring"
										weight="duotone"
									/>
								)}
							</AvatarFallback>
						</Avatar>
					</div>
					<div className="flex min-w-0 flex-1 flex-col items-start">
						<span className="truncate text-left font-semibold text-sidebar-accent-foreground text-sm">
							{activeOrganization?.name || 'Personal'}
						</span>
						<p className="truncate text-left text-sidebar-accent-foreground/70 text-xs">
							{activeOrganization?.slug || 'Your workspace'}
						</p>
					</div>
				</div>
				{isSettingActiveOrganization ? (
					<SpinnerGapIcon
						aria-label="Switching workspace"
						className="h-4 w-4 animate-spin text-sidebar-accent-foreground/60"
						weight="duotone"
					/>
				) : (
					<CaretDownIcon
						className={cn(
							'h-4 w-4 text-sidebar-accent-foreground/60 transition-transform duration-200',
							isOpen && 'rotate-180'
						)}
						weight="fill"
					/>
				)}
			</div>
		</div>
	);
}

export function OrganizationSelector() {
	const {
		organizations,
		activeOrganization,
		isLoading,
		setActiveOrganization,
		isSettingActiveOrganization,
		hasError,
		activeOrganizationError,
	} = useOrganizations();
	const [isOpen, setIsOpen] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [query, setQuery] = useState('');

	const [hasHandledMissingOrg, setHasHandledMissingOrg] = useState(false);

	const isActiveOrgNotFound =
		activeOrganizationError?.message?.includes('ORGANIZATION_NOT_FOUND') ||
		activeOrganizationError?.message?.includes('Organization not found');

	if (
		isActiveOrgNotFound &&
		!hasHandledMissingOrg &&
		!isSettingActiveOrganization
	) {
		setHasHandledMissingOrg(true);
		// Clear the active organization to fall back to personal workspace
		setActiveOrganization(null);
	}

	const handleSelectOrganization = useCallback(
		(organizationId: string | null) => {
			if (organizationId === activeOrganization?.id) {
				return;
			}
			if (organizationId === null && !activeOrganization) {
				return;
			}
			setActiveOrganization(organizationId);
			setIsOpen(false);
		},
		[activeOrganization, setActiveOrganization]
	);

	const handleCreateOrganization = useCallback(() => {
		setShowCreateDialog(true);
		setIsOpen(false);
	}, []);

	const filteredOrganizations = filterOrganizations(organizations, query);

	if (isLoading) {
		return (
			<div className="flex h-12 w-full items-center border-sidebar-border border-b bg-sidebar-accent px-3 py-3">
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="rounded-lg bg-sidebar/80 p-1.5 shadow-sm ring-1 ring-sidebar-border/50">
							<Skeleton className="h-5 w-5 rounded" />
						</div>
						<div className="flex min-w-0 flex-1 flex-col items-start">
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="mt-1 h-3 w-16 rounded" />
						</div>
					</div>
					<Skeleton className="h-4 w-4 rounded" />
				</div>
			</div>
		);
	}

	if (hasError && !isActiveOrgNotFound) {
		return (
			<div className="border-sidebar-border border-b bg-destructive/10 px-3 py-3">
				<div className="flex items-center gap-3">
					<div className="rounded bg-sidebar/80 p-1.5 shadow-sm ring-1 ring-destructive/50">
						<UserIcon className="h-5 w-5 text-destructive" weight="duotone" />
					</div>
					<div className="min-w-0 flex-1">
						<span className="font-semibold text-destructive text-sm">
							Failed to load workspaces
						</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<DropdownMenu
				onOpenChange={(open) => {
					setIsOpen(open);
					if (!open) {
						setQuery('');
					}
				}}
				open={isOpen}
			>
				<DropdownMenuTrigger asChild>
					<Button
						aria-expanded={isOpen}
						aria-haspopup="listbox"
						className="h-auto w-full rounded-none p-0 hover:bg-transparent"
						disabled={isSettingActiveOrganization}
						type="button"
						variant="ghost"
					>
						<OrganizationSelectorTrigger
							activeOrganization={activeOrganization}
							isOpen={isOpen}
							isSettingActiveOrganization={isSettingActiveOrganization}
						/>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-72 rounded-none border-sidebar-border bg-sidebar p-0"
					sideOffset={0}
				>
					<DropdownMenuItem
						className={cn(
							'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors',
							'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground text-sidebar-foreground/70',
							!activeOrganization && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
						)}
						onClick={() => handleSelectOrganization(null)}
					>
						<UserIcon className="h-5 w-5 not-dark:text-primary" weight="duotone" />
						<div className="flex min-w-0 flex-1 flex-col items-start text-left">
							<span className="text-left font-medium text-sm">Personal</span>
							<span className="text-left text-sidebar-foreground/70 text-xs">
								Your workspace
							</span>
						</div>
						{!activeOrganization && (
							<CheckIcon
								className="h-4 w-4 not-dark:text-primary"
								weight="duotone"
							/>
						)}
					</DropdownMenuItem>

					{filteredOrganizations && filteredOrganizations.length > 0 && (
						<div className="flex flex-col">
							<DropdownMenuSeparator className="my-1 bg-sidebar-border" />
							{filteredOrganizations.map((org) => (
								<DropdownMenuItem
									className={cn(
										'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors',
										'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground text-sidebar-foreground/70',
										activeOrganization?.id === org.id &&
											'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
									)}
									key={org.id}
									onClick={() => handleSelectOrganization(org.id)}
								>
									<Avatar className="h-5 w-5">
										<AvatarImage alt={org.name} src={org.logo || undefined} />
										<AvatarFallback className="bg-sidebar-primary/30 text-xs">
											{getOrganizationInitials(org.name)}
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-1 flex-col items-start text-left">
										<span className="truncate text-left font-medium text-sm">
											{org.name}
										</span>
										<span className="truncate text-left text-sidebar-foreground/70 text-xs">
											{org.slug}
										</span>
									</div>
									{activeOrganization?.id === org.id && (
										<CheckIcon
											className="h-4 w-4 not-dark:text-primary"
											weight="duotone"
										/>
									)}
								</DropdownMenuItem>
							))}
						</div>
					)}

					{filteredOrganizations.length === 0 && (
						<div className="px-4 py-2.5 text-sidebar-foreground/60 text-xs">
							No workspaces match "{query}".
						</div>
					)}

					<DropdownMenuSeparator className="my-1 bg-sidebar-border" />
					<DropdownMenuItem
						className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground text-sidebar-foreground/70"
						onClick={handleCreateOrganization}
					>
						<PlusIcon className="h-5 w-5 not-dark:text-primary" />
						<span className="font-medium text-sm">Create Organization</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<CreateOrganizationDialog
				isOpen={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
			/>
		</>
	);
}
