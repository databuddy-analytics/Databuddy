"use client";

import { authClient } from "@databuddy/auth/client";
import {
	CaretDownIcon,
	CheckIcon,
	PlusIcon,
	SpinnerGapIcon,
	UserIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import {
	AUTH_QUERY_KEYS,
	useOrganizationsContext,
} from "@/components/providers/organizations-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const getOrganizationInitials = (name: string) =>
	name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

const MENU_ITEM_BASE_CLASSES =
	"flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground";
const MENU_ITEM_ACTIVE_CLASSES =
	"bg-sidebar-accent font-medium text-sidebar-accent-foreground";

function filterOrganizations<T extends { name: string; slug?: string | null }>(
	orgs: T[] | undefined,
	query: string
): T[] {
	if (!orgs?.length) {
		return [];
	}
	if (!query) {
		return orgs;
	}
	const q = query.toLowerCase();
	return orgs.filter(
		(org) =>
			org.name.toLowerCase().includes(q) || org.slug?.toLowerCase().includes(q)
	);
}

type OrganizationSelectorTriggerProps = {
	activeOrganization: {
		name: string;
		slug?: string | null;
		logo?: string | null;
	} | null;
	isOpen: boolean;
	isSettingActiveOrganization: boolean;
};

function OrganizationSelectorTrigger({
	activeOrganization,
	isOpen,
	isSettingActiveOrganization,
}: OrganizationSelectorTriggerProps) {
	return (
		<div
			className={cn(
				"flex h-12 w-full items-center border-b bg-sidebar-accent px-3 py-3",
				"hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
				isSettingActiveOrganization && "cursor-not-allowed opacity-70",
				isOpen && "bg-sidebar-accent/60"
			)}
		>
			<div className="flex w-full items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="rounded">
						<Avatar className="size-7">
							<AvatarImage
								alt={activeOrganization?.name || "Personal"}
								className="rounded"
								src={activeOrganization?.logo || undefined}
							/>
							<AvatarFallback className="bg-secondary font-medium text-xs">
								{activeOrganization?.name ? (
									getOrganizationInitials(activeOrganization.name)
								) : (
									<UserIcon weight="duotone" />
								)}
							</AvatarFallback>
						</Avatar>
					</div>
					<div className="flex min-w-0 flex-1 flex-col items-start">
						<span className="truncate text-left font-semibold text-sidebar-accent-foreground text-sm">
							{activeOrganization?.name || "Personal"}
						</span>
						<p className="truncate text-left text-sidebar-accent-foreground/70 text-xs">
							{activeOrganization?.slug || "Your workspace"}
						</p>
					</div>
				</div>
				{isSettingActiveOrganization ? (
					<SpinnerGapIcon
						aria-label="Switching workspace"
						className="size-4 animate-spin text-sidebar-accent-foreground/60"
						weight="duotone"
					/>
				) : (
					<CaretDownIcon
						className={cn(
							"size-4 text-sidebar-accent-foreground/60 transition-transform duration-200",
							isOpen && "rotate-180"
						)}
					/>
				)}
			</div>
		</div>
	);
}

export function OrganizationSelector() {
	const queryClient = useQueryClient();
	const { organizations, activeOrganization, isLoading } =
		useOrganizationsContext();
	const [isOpen, setIsOpen] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [query, setQuery] = useState("");
	const [isSwitching, setIsSwitching] = useState(false);

	const handleSelectOrganization = async (organizationId: string | null) => {
		const isAlreadySelected =
			organizationId === activeOrganization?.id ||
			(organizationId === null && !activeOrganization);

		if (isAlreadySelected) {
			return;
		}

		setIsSwitching(true);
		setIsOpen(false);

		const { error } = await authClient.organization.setActive({
			organizationId,
		});

		if (error) {
			toast.error(error.message || "Failed to switch workspace");
			setIsSwitching(false);
			return;
		}

		await queryClient.invalidateQueries({
			queryKey: AUTH_QUERY_KEYS.activeOrganization,
		});
		queryClient.invalidateQueries();

		setIsSwitching(false);
		toast.success("Workspace updated");
	};

	const filteredOrganizations = filterOrganizations(organizations, query);

	if (isLoading) {
		return (
			<div className="flex h-12 w-full items-center bg-sidebar-accent px-3 py-3">
				<div className="flex w-full items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="rounded-lg border bg-sidebar/80 p-1.5">
							<Skeleton className="size-5 rounded" />
						</div>
						<div className="flex min-w-0 flex-1 flex-col items-start">
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="mt-1 h-3 w-16 rounded" />
						</div>
					</div>
					<Skeleton className="size-4 rounded" />
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
						setQuery("");
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
					className="w-72 rounded-none border-t-0 border-r border-l-0 bg-sidebar p-0"
					sideOffset={0}
				>
					<DropdownMenuItem
						className={cn(
							"flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 text-sm",
							"text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
							!activeOrganization &&
								"bg-sidebar-accent font-medium text-sidebar-accent-foreground"
						)}
						onClick={() => handleSelectOrganization(null)}
					>
						<UserIcon
							className="size-5 text-accent-foreground"
							weight="duotone"
						/>
						<div className="flex min-w-0 flex-1 flex-col items-start text-left">
							<span className="text-left font-medium text-sm">Personal</span>
							<span className="text-left text-sidebar-foreground/70 text-xs">
								Your workspace
							</span>
						</div>
						{!activeOrganization && (
							<CheckIcon className="size-4 text-accent-foreground" />
						)}
					</DropdownMenuItem>

					{filteredOrganizations.length > 0 && (
						<div className="flex flex-col">
							{filteredOrganizations.map((org) => (
								<DropdownMenuItem
									className={cn(
										MENU_ITEM_BASE_CLASSES,
										activeOrganization?.id === org.id &&
											MENU_ITEM_ACTIVE_CLASSES
									)}
									key={org.id}
									onClick={() => handleSelectOrganization(org.id)}
								>
									<Avatar className="size-5">
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
										<CheckIcon className="size-4 text-accent-foreground" />
									)}
								</DropdownMenuItem>
							))}
						</div>
					)}

					<DropdownMenuSeparator className="m-0 p-0" />
					<DropdownMenuItem
						className={MENU_ITEM_BASE_CLASSES}
						onClick={() => {
							setShowCreateDialog(true);
							setIsOpen(false);
						}}
					>
						<PlusIcon className="size-5 text-accent-foreground" />
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
