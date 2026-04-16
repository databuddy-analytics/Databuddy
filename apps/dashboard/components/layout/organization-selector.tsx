"use client";

import { authClient } from "@databuddy/auth/client";
import { CaretDownIcon } from "@phosphor-icons/react";
import { CheckIcon } from "@phosphor-icons/react";
import { CreditCardIcon } from "@phosphor-icons/react";
import { GearIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { SpinnerGapIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import { useBillingContext } from "@/components/providers/billing-provider";
import {
	AUTH_QUERY_KEYS,
	useOrganizationsContext,
} from "@/components/providers/organizations-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

const getDicebearUrl = (seed: string | undefined) =>
	`https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed || "")}`;

const MENU_ITEM_BASE_CLASSES =
	"flex h-10 cursor-pointer items-center gap-3 px-4 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground";
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

interface OrganizationSelectorTriggerProps {
	activeOrganization: {
		id?: string;
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
				"flex h-12 w-full items-center overflow-hidden border-b bg-sidebar-accent px-3 py-3",
				"hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
				isSettingActiveOrganization ? "cursor-not-allowed opacity-70" : "",
				isOpen ? "bg-sidebar-accent/60" : ""
			)}
		>
			<div className="flex w-full min-w-0 items-center gap-2">
				<div className="shrink-0 rounded">
					<Avatar className="size-7 ring-1 ring-black/10 ring-inset">
						<AvatarImage
							alt={activeOrganization?.name ?? "Workspace"}
							className="rounded"
							src={getDicebearUrl(
								activeOrganization?.logo || activeOrganization?.id
							)}
						/>
						<AvatarFallback className="bg-secondary">
							<Image
								alt={activeOrganization?.name ?? "Workspace"}
								className="rounded"
								height={28}
								src={getDicebearUrl(
									activeOrganization?.logo || activeOrganization?.id
								)}
								unoptimized
								width={28}
							/>
						</AvatarFallback>
					</Avatar>
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
					<span className="min-w-0 truncate text-left font-semibold text-sidebar-accent-foreground text-sm">
						{activeOrganization?.name ?? "Select workspace"}
					</span>
					<p className="truncate text-left text-sidebar-accent-foreground/70 text-xs">
						{activeOrganization?.slug ?? "No workspace selected"}
					</p>
				</div>
				{isSettingActiveOrganization ? (
					<SpinnerGapIcon
						aria-label="Switching workspace"
						className="size-4 shrink-0 animate-spin text-sidebar-accent-foreground/60"
						weight="duotone"
					/>
				) : (
					<CaretDownIcon
						className={cn(
							"size-4 shrink-0 text-sidebar-accent-foreground/60 transition-transform duration-200",
							isOpen ? "rotate-180" : ""
						)}
					/>
				)}
			</div>
		</div>
	);
}

export function OrganizationSelector() {
	const queryClient = useQueryClient();
	const router = useRouter();
	const { organizations, activeOrganization, isLoading } =
		useOrganizationsContext();
	const { currentPlanId } = useBillingContext();
	const [isOpen, setIsOpen] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [query, setQuery] = useState("");
	const [isSwitching, setIsSwitching] = useState(false);

	const planLabel = currentPlanId
		? currentPlanId.charAt(0).toUpperCase() + currentPlanId.slice(1)
		: null;

	const navigateTo = (href: string) => {
		setIsOpen(false);
		router.push(href);
	};

	const handleSelectOrganization = async (organizationId: string) => {
		if (organizationId === activeOrganization?.id) {
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
			<div className="flex h-12 w-full items-center border-b bg-sidebar-accent px-3 py-3">
				<div className="flex w-full min-w-0 items-center justify-between">
					<div className="flex min-w-0 items-center gap-3">
						<div className="shrink-0 rounded-lg bg-sidebar/80 p-1.5 ring-1 ring-black/10 ring-inset">
							<Skeleton className="size-5 rounded" />
						</div>
						<div className="flex min-w-0 flex-1 flex-col items-start">
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="mt-1 h-3 w-16 rounded" />
						</div>
					</div>
					<Skeleton className="size-4 shrink-0 rounded" />
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
						className="h-auto w-full overflow-hidden rounded-none p-0 hover:bg-transparent"
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
									<Avatar className="size-5 ring-1 ring-black/10 ring-inset">
										<AvatarImage
											alt={org.name}
											src={getDicebearUrl(org.logo || org.id)}
										/>
										<AvatarFallback className="bg-sidebar-primary/30">
											<Image
												alt={org.name}
												className="rounded"
												height={20}
												src={getDicebearUrl(org.logo || org.id)}
												unoptimized
												width={20}
											/>
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-1 flex-col items-start overflow-hidden text-left">
										<span className="w-full truncate text-left font-medium text-sm">
											{org.name}
										</span>
										<span className="w-full truncate text-left text-sidebar-foreground/70 text-xs">
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
						onClick={() => navigateTo("/organizations/settings")}
					>
						<GearIcon
							className="size-5 text-accent-foreground"
							weight="duotone"
						/>
						<span className="font-medium text-sm">Workspace settings</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						className={MENU_ITEM_BASE_CLASSES}
						onClick={() => navigateTo("/billing")}
					>
						<CreditCardIcon
							className="size-5 text-accent-foreground"
							weight="duotone"
						/>
						<span className="font-medium text-sm">Billing</span>
						{planLabel && (
							<Badge className="ml-auto" variant="outline">
								{planLabel}
							</Badge>
						)}
					</DropdownMenuItem>
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
