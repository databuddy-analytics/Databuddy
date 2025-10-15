'use client';

import { authClient } from '@databuddy/auth/client';
import {
	CaretDownIcon,
	CheckIcon,
	PlusIcon,
	SpinnerGapIcon,
	UserIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { toast } from 'sonner';
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
					<div className="rounded shadow-sm">
						<Avatar className="h-5 w-5">
							<AvatarImage
								alt={activeOrganization?.name || 'Personal'}
								className="rounded"
								src={activeOrganization?.logo || undefined}
							/>
							<AvatarFallback className="bg-transparent font-medium text-xs">
								{activeOrganization?.name ? (
									getOrganizationInitials(activeOrganization.name)
								) : (
									<UserIcon className="text-sidebar-ring" weight="duotone" />
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
	const { data: organizations, isPending: isLoadingOrgs } = authClient.useListOrganizations();
	const { data: activeOrganization, isPending: isLoadingActive } = authClient.useActiveOrganization();
	const [isOpen, setIsOpen] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [query, setQuery] = useState('');
	const [isSwitching, setIsSwitching] = useState(false);

	const isLoading = isLoadingOrgs || isLoadingActive;

	const handleSelectOrganization = async (organizationId: string | null) => {
		if (organizationId === activeOrganization?.id) return;
		if (organizationId === null && !activeOrganization) return;

		setIsSwitching(true);
		setIsOpen(false);

		const { error } = await authClient.organization.setActive({ organizationId });
		
		if (error) {
			toast.error(error.message || 'Failed to switch workspace');
		} else {
			toast.success('Workspace updated');
		}
		
		setIsSwitching(false);
	};

	const handleCreateOrganization = () => {
		setShowCreateDialog(true);
		setIsOpen(false);
	};

	const filteredOrganizations = filterOrganizations(organizations || [], query);

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
						disabled={isSwitching}
						type="button"
						variant="ghost"
					>
						<OrganizationSelectorTrigger
							activeOrganization={activeOrganization}
							isOpen={isOpen}
							isSettingActiveOrganization={isSwitching}
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
							'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
							!activeOrganization &&
								'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
						)}
						onClick={() => handleSelectOrganization(null)}
					>
						<UserIcon
							className="h-5 w-5 not-dark:text-primary"
							weight="duotone"
						/>
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
										'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
										activeOrganization?.id === org.id &&
											'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
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

					<DropdownMenuSeparator className="my-1 bg-sidebar-border" />
					<DropdownMenuItem
						className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sidebar-foreground/70 text-sm transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
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
