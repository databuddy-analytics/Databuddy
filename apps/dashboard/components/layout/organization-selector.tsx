'use client';

import {
	CaretDownIcon,
	CheckIcon,
	PlusIcon,
	SpinnerGapIcon,
	UserIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
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

export function OrganizationSelector() {
	const {
		organizations,
		activeOrganization,
		isLoading,
		setActiveOrganization,
		isSettingActiveOrganization,
		hasError,
	} = useOrganizations();
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [query, setQuery] = useState('');

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

	const handleManageOrganizations = useCallback(() => {
		router.push('/organizations');
		setIsOpen(false);
	}, [router]);

	const filteredOrganizations = filterOrganizations(organizations, query);

	if (isLoading) {
		return (
			<div className="rounded border border-border/50 bg-accent/30 px-2 py-2">
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-8 rounded" />
					<div className="space-y-1">
						<Skeleton className="h-4 w-24 rounded" />
						<Skeleton className="h-3 w-16 rounded" />
					</div>
				</div>
			</div>
		);
	}

	if (hasError) {
		return (
			<div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive">
				<div className="flex items-center gap-2 text-sm">
					<span>Failed to load workspaces</span>
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
						className="h-auto w-full p-0 hover:bg-transparent"
						disabled={isSettingActiveOrganization}
						type="button"
						variant="ghost"
					>
						<div
							className={cn(
								'w-full rounded border border-border/50 bg-accent/30 px-2 py-2 transition-colors',
								'hover:border-border/70 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
								isSettingActiveOrganization && 'cursor-not-allowed opacity-70',
								isOpen && 'border-border/70 bg-accent/50'
							)}
						>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Avatar className="h-8 w-8 border border-border/50">
										<AvatarImage
											alt={activeOrganization?.name || 'Personal'}
											src={activeOrganization?.logo || undefined}
										/>
										<AvatarFallback className="bg-muted font-medium text-xs">
											{activeOrganization?.name ? (
												getOrganizationInitials(activeOrganization.name)
											) : (
												<UserIcon
													className="not-dark:text-primary"
													weight="duotone"
												/>
											)}
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-col text-left">
										<span className="max-w-[140px] truncate font-medium text-sm sm:max-w-[180px]">
											{activeOrganization?.name || 'Personal'}
										</span>
										<span className="max-w-[140px] truncate text-muted-foreground text-xs sm:max-w-[180px]">
											{activeOrganization?.slug || 'Your workspace'}
										</span>
									</div>
								</div>
								{isSettingActiveOrganization ? (
									<SpinnerGapIcon
										aria-label="Switching workspace"
										className="h-4 w-4 animate-spin text-muted-foreground"
										weight="duotone"
									/>
								) : (
									<CaretDownIcon
										className={cn(
											'h-4 w-4 text-muted-foreground transition-transform duration-200',
											isOpen && 'rotate-180'
										)}
										weight="fill"
									/>
								)}
							</div>
						</div>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-72 p-1" sideOffset={4}>
					{/* Personal Workspace */}
					<DropdownMenuItem
						className={cn(
							'flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors',
							'focus:bg-accent focus:text-accent-foreground',
							!activeOrganization && 'bg-accent text-accent-foreground'
						)}
						onClick={() => handleSelectOrganization(null)}
					>
						<Avatar className="h-6 w-6">
							<AvatarFallback className="bg-muted text-xs">
								<UserIcon className="not-dark:text-primary" weight="duotone" />
							</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="font-medium text-sm">Personal</span>
							<span className="text-muted-foreground text-xs">
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
						<div className="flex flex-col gap-1">
							<DropdownMenuSeparator className="my-1" />
							{filteredOrganizations.map((org) => (
								<DropdownMenuItem
									className={cn(
										'flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors',
										'focus:bg-accent focus:text-accent-foreground',
										activeOrganization?.id === org.id &&
											'bg-accent text-accent-foreground'
									)}
									key={org.id}
									onClick={() => handleSelectOrganization(org.id)}
								>
									<Avatar className="h-6 w-6">
										<AvatarImage alt={org.name} src={org.logo || undefined} />
										<AvatarFallback className="bg-muted text-xs">
											{getOrganizationInitials(org.name)}
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-medium text-sm">
											{org.name}
										</span>
										<span className="truncate text-muted-foreground text-xs">
											{org.slug}
										</span>
									</div>
									{activeOrganization?.id === org.id && (
										<CheckIcon
											className="h-4 w-4 text-primary"
											weight="duotone"
										/>
									)}
								</DropdownMenuItem>
							))}
						</div>
					)}

					{filteredOrganizations.length === 0 && (
						<div className="px-2 py-2 text-muted-foreground text-xs">
							No workspaces match “{query}”.
						</div>
					)}

					<DropdownMenuSeparator className="my-1" />
					<DropdownMenuItem
						className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors focus:bg-accent focus:text-accent-foreground"
						onClick={handleCreateOrganization}
					>
						<div className="flex h-6 w-6 items-center justify-center rounded bg-muted">
							<PlusIcon className="not-dark:text-primary" />
						</div>
						<span className="font-medium text-sm">Create Organization</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors focus:bg-accent focus:text-accent-foreground"
						onClick={handleManageOrganizations}
					>
						<div className="flex h-6 w-6 items-center justify-center rounded bg-muted">
							<UsersIcon className="not-dark:text-primary" weight="duotone" />
						</div>
						<span className="font-medium text-sm">Manage Organizations</span>
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
