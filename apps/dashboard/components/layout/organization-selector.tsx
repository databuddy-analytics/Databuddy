"use client";

import { authClient } from "@databuddy/auth/client";
import { PLAN_IDS, type PlanId } from "@databuddy/shared/types/features";
import {
	CheckIcon,
	ChevronDownIcon,
	PlusIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
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

const getPlanDisplayInfo = (planId: PlanId | null) => {
	if (!planId || planId === PLAN_IDS.FREE) {
		return { name: "Free", variant: "gray" as const };
	}
	if (planId === PLAN_IDS.HOBBY) {
		return { name: "Hobby", variant: "blue" as const };
	}
	if (planId === PLAN_IDS.PRO) {
		return { name: "Pro", variant: "green" as const };
	}
	if (planId === PLAN_IDS.SCALE) {
		return { name: "Scale", variant: "amber" as const };
	}

	return null;
};

const MENU_ITEM_BASE_CLASSES =
	"flex h-16 cursor-pointer items-center gap-3 px-4 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground border-b border-border";
const MENU_ITEM_ACTIVE_CLASSES =
	"bg-muted font-medium text-foreground";

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
	currentPlanId: PlanId | null;
}

function OrganizationSelectorTrigger({
	activeOrganization,
	isOpen,
	isSettingActiveOrganization,
	currentPlanId,
}: OrganizationSelectorTriggerProps) {
	const planInfo = getPlanDisplayInfo(currentPlanId);

	return (
		<div
			className={cn(
				"flex h-16 w-full items-center border-b border-border px-4",
				"hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				isSettingActiveOrganization ? "cursor-not-allowed opacity-70" : "",
				isOpen ? "bg-muted/50" : ""
			)}
		>
			<div className="flex w-full min-w-0 items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<div className="shrink-0">
						<Avatar className="size-8 rounded-full">
							<AvatarImage
								alt={activeOrganization?.name ?? "Workspace"}
								className="rounded-full"
								src={getDicebearUrl(
									activeOrganization?.logo || activeOrganization?.id
								)}
							/>
							<AvatarFallback className="rounded-full bg-muted">
								<Image
									alt={activeOrganization?.name ?? "Workspace"}
									className="rounded-full"
									height={32}
									src={getDicebearUrl(
										activeOrganization?.logo || activeOrganization?.id
									)}
									unoptimized
									width={32}
								/>
							</AvatarFallback>
						</Avatar>
					</div>
					<div className="flex min-w-0 flex-1 flex-col items-start">
						<div className="flex min-w-0 items-center gap-2">
							<span className="min-w-0 truncate text-left font-medium text-foreground text-sm leading-none">
								{activeOrganization?.name ?? "Select workspace"}
							</span>
							<Badge
								className="shrink-0 rounded-none px-2 py-0.5 font-mono text-xs font-semibold uppercase leading-none"
								variant={planInfo?.variant === "gray" ? "secondary" : "default"}
							>
								{planInfo?.name || "Free"}
							</Badge>
						</div>
						<p className="mt-1 truncate text-left text-muted-foreground text-xs leading-none">
							{activeOrganization?.slug ?? "No workspace selected"}
						</p>
					</div>
				</div>
				{isSettingActiveOrganization ? (
					<div className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
				) : (
					<ChevronDownIcon
						className={cn(
							"size-4 shrink-0 text-muted-foreground transition-transform duration-200",
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
	const { organizations, activeOrganization, isLoading } =
		useOrganizationsContext();
	const { currentPlanId } = useBillingContext();
	const [isOpen, setIsOpen] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [query, setQuery] = useState("");
	const [isSwitching, setIsSwitching] = useState(false);

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
			<div className="flex h-16 w-full items-center border-b border-border px-4">
				<div className="flex w-full min-w-0 items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<Skeleton className="size-8 shrink-0 rounded-full" />
						<div className="flex min-w-0 flex-1 flex-col items-start gap-1">
							<div className="flex items-center gap-2">
								<Skeleton className="h-4 w-24 rounded" />
								<Skeleton className="h-4 w-12 rounded-none" />
							</div>
							<Skeleton className="h-3 w-16 rounded" />
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
						className="h-auto w-full rounded-none p-0 hover:bg-transparent"
						disabled={isSwitching}
						type="button"
						variant="ghost"
					>
						<OrganizationSelectorTrigger
							activeOrganization={activeOrganization}
							currentPlanId={currentPlanId}
							isOpen={isOpen}
							isSettingActiveOrganization={isSwitching}
						/>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="w-72 rounded-none border-t-0 border-r border-l-0 bg-background p-0"
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
									<Avatar className="size-6 rounded-full">
										<AvatarImage
											alt={org.name}
											className="rounded-full"
											src={getDicebearUrl(org.logo || org.id)}
										/>
										<AvatarFallback className="rounded-full bg-muted">
											<Image
												alt={org.name}
												className="rounded-full"
												height={24}
												src={getDicebearUrl(org.logo || org.id)}
												unoptimized
												width={24}
											/>
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-1 flex-col items-start text-left">
										<span className="truncate text-left font-medium text-foreground text-sm">
											{org.name}
										</span>
										<span className="truncate text-left text-muted-foreground text-xs">
											{org.slug}
										</span>
									</div>
									{activeOrganization?.id === org.id && (
										<CheckIcon className="size-4 text-foreground" />
									)}
								</DropdownMenuItem>
							))}
						</div>
					)}

					<DropdownMenuSeparator className="m-0 p-0" />
					<DropdownMenuItem
						className={cn(MENU_ITEM_BASE_CLASSES, "border-b-0")}
						onClick={() => {
							setShowCreateDialog(true);
							setIsOpen(false);
						}}
					>
						<PlusIcon className="size-5 text-foreground" />
						<span className="font-medium text-foreground text-sm">Create Organization</span>
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
