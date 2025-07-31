'use client';

import {
	CaretDownIcon,
	CheckIcon,
	PlusIcon,
	UserIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
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

export function OrganizationSelector() {
	const {
		organizations,
		activeOrganization,
		isLoading,
		setActiveOrganization,
		isSettingActiveOrganization,
	} = useOrganizations();
	const router = useRouter();
	const [isOpen, setIsOpen] = React.useState(false);
	const [showCreateDialog, setShowCreateDialog] = React.useState(false);

	const handleSelectOrganization = React.useCallback(
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

	const handleCreateOrganization = React.useCallback(() => {
		setShowCreateDialog(true);
		setIsOpen(false);
	}, []);

	const handleManageOrganizations = React.useCallback(() => {
		router.push('/organizations');
		setIsOpen(false);
	}, [router]);

	if (isLoading) {
		return (
			<div className="rounded border border-border/50 bg-accent/30 px-2 py-2">
				<div className="flex items-center gap-3">
					<Skeleton className="h-8 w-8 rounded-full" />
					<div className="space-y-1">
						<Skeleton className="h-4 w-24 rounded" />
						<Skeleton className="h-3 w-16 rounded" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						className="h-auto w-full p-0 hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
						disabled={isSettingActiveOrganization}
						variant="ghost"
					>
						<div
							className={cn(
								'w-full rounded border border-border/50 bg-accent/30 px-2 py-2 transition-all duration-200',
								'hover:border-border/70 hover:bg-accent/50',
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
													className="h-4 w-4"
													size={32}
													weight="duotone"
												/>
											)}
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-col text-left">
										<span className="max-w-[140px] truncate font-medium text-sm">
											{activeOrganization?.name || 'Personal'}
										</span>
										<span className="max-w-[140px] truncate text-muted-foreground text-xs">
											{activeOrganization?.slug || 'Your workspace'}
										</span>
									</div>
								</div>
								<CaretDownIcon
									className={cn(
										'h-4 w-4 text-muted-foreground transition-transform duration-200',
										isOpen && 'rotate-180'
									)}
									size={32}
									weight="duotone"
								/>
							</div>
						</div>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-64 p-1" sideOffset={4}>
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
								<UserIcon className="h-4 w-4" size={32} weight="duotone" />
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
								className="h-4 w-4 text-primary"
								size={32}
								weight="duotone"
							/>
						)}
					</DropdownMenuItem>

					{organizations && organizations.length > 0 && (
						<>
							<DropdownMenuSeparator className="my-1" />
							{organizations.map((org) => (
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
											size={32}
											weight="duotone"
										/>
									)}
								</DropdownMenuItem>
							))}
						</>
					)}

					<DropdownMenuSeparator className="my-1" />
					<DropdownMenuItem
						className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors focus:bg-accent focus:text-accent-foreground"
						onClick={handleCreateOrganization}
					>
						<div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
							<PlusIcon className="h-4 w-4 text-muted-foreground" size={32} />
						</div>
						<span className="font-medium text-sm">Create Organization</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 transition-colors focus:bg-accent focus:text-accent-foreground"
						onClick={handleManageOrganizations}
					>
						<div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
							<UsersIcon
								className="h-4 w-4 text-muted-foreground"
								size={32}
								weight="duotone"
							/>
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
