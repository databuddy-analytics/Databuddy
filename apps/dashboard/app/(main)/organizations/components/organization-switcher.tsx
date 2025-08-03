'use client';

import { ArrowRightIcon, CheckIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	type ActiveOrganization,
	type Organization,
	useOrganizations,
} from '@/hooks/use-organizations';
import { cn, getOrganizationInitials } from '@/lib/utils';

interface OrganizationSwitcherProps {
	organizations: Organization[];
	activeOrganization: ActiveOrganization;
	className?: string;
}

export function OrganizationSwitcher({
	organizations,
	activeOrganization,
	className,
}: OrganizationSwitcherProps) {
	const { setActiveOrganization, isSettingActiveOrganization } =
		useOrganizations();
	const [isOpen, setIsOpen] = useState(false);

	const handleSwitchOrganization = (organizationId: string) => {
		setActiveOrganization(organizationId);
		setIsOpen(false);
	};

	const handleSwitchToPersonal = () => {
		setActiveOrganization(null);
		setIsOpen(false);
	};

	if (organizations.length === 0) {
		return null;
	}

	return (
		<DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					className={cn(
						'h-9 justify-start gap-2 rounded border border-border/50 bg-background px-3 font-normal text-sm hover:bg-accent hover:text-accent-foreground',
						className
					)}
					variant="outline"
				>
					<Avatar className="h-5 w-5">
						<AvatarImage
							alt={activeOrganization?.name || 'Personal'}
							src={activeOrganization?.logo || undefined}
						/>
						<AvatarFallback className="bg-accent text-xs">
							{activeOrganization
								? getOrganizationInitials(activeOrganization.name)
								: 'P'}
						</AvatarFallback>
					</Avatar>
					<span className="max-w-[120px] truncate">
						{activeOrganization?.name || 'Personal'}
					</span>
					<ArrowRightIcon className="ml-auto h-3 w-3 opacity-50" size={16} />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
				<DropdownMenuSeparator />

				{/* Personal Workspace Option */}
				<DropdownMenuItem
					className={cn(
						'flex items-center gap-2',
						!activeOrganization && 'bg-accent'
					)}
					onClick={handleSwitchToPersonal}
				>
					<Avatar className="h-6 w-6">
						<AvatarFallback className="bg-accent text-xs">P</AvatarFallback>
					</Avatar>
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<span className="font-medium">Personal</span>
							{!activeOrganization && (
								<CheckIcon className="h-3 w-3 text-primary" size={12} />
							)}
						</div>
						<p className="text-muted-foreground text-xs">
							Your personal workspace
						</p>
					</div>
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				{/* Organization Options */}
				{organizations.map((org) => (
					<DropdownMenuItem
						className={cn(
							'flex items-center gap-2',
							activeOrganization?.id === org.id && 'bg-accent'
						)}
						key={org.id}
						onClick={() => handleSwitchOrganization(org.id)}
					>
						<Avatar className="h-6 w-6">
							<AvatarImage alt={org.name} src={org.logo || undefined} />
							<AvatarFallback className="bg-accent text-xs">
								{getOrganizationInitials(org.name)}
							</AvatarFallback>
						</Avatar>
						<div className="flex-1">
							<div className="flex items-center gap-2">
								<span className="font-medium">{org.name}</span>
								{activeOrganization?.id === org.id && (
									<CheckIcon className="h-3 w-3 text-primary" size={12} />
								)}
							</div>
							<p className="text-muted-foreground text-xs">@{org.slug}</p>
						</div>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
