"use client";

import { authClient } from "@databuddy/auth/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
	CaretDownIcon,
	CheckIcon,
	CreditCardIcon,
	GearIcon,
	PlusIcon,
	SpinnerGapIcon,
} from "@databuddy/ui/icons";
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import { useBillingContext } from "@/components/providers/billing-provider";
import {
	AUTH_QUERY_KEYS,
	useOrganizationsContext,
} from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { pendingActiveOrganizationIdAtom } from "@/stores/jotai/organizationsAtoms";
import { Avatar, DropdownMenu } from "@databuddy/ui/client";
import { Badge, Skeleton, Tooltip, useHydrated } from "@databuddy/ui";

const getDicebearUrl = (seed: string | undefined) =>
	`https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(seed || "")}`;

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

function OrgDropdownItems({
	organizations,
	activeId,
	planLabel,
	onSelect,
	onNavigate,
	onCreateClick,
}: {
	activeId?: string;
	onCreateClick: () => void;
	onNavigate: (href: string) => void;
	onSelect: (id: string) => void;
	organizations: Array<{
		id: string;
		name: string;
		slug?: string | null;
		logo?: string | null;
	}>;
	planLabel: string | null;
}) {
	return (
		<>
			{organizations.map((org) => (
				<DropdownMenu.Item
					className={cn(
						"flex h-9 items-center gap-2.5 rounded px-2.5 text-sm",
						activeId === org.id &&
							"bg-accent font-semibold text-accent-foreground"
					)}
					key={org.id}
					onClick={() => onSelect(org.id)}
				>
					<Avatar
						alt={org.name}
						className="size-5 shrink-0 rounded ring-1 ring-black/10 ring-inset"
						src={getDicebearUrl(org.logo || org.id)}
					/>
					<span className="min-w-0 flex-1 truncate font-medium text-sm">
						{org.name}
					</span>
					{activeId === org.id && (
						<CheckIcon className="size-4 shrink-0 text-accent-foreground" />
					)}
				</DropdownMenu.Item>
			))}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onClick={() => onNavigate("/organizations/settings")}>
				<GearIcon className="size-4 shrink-0" />
				Organization settings
			</DropdownMenu.Item>
			<DropdownMenu.Item onClick={() => onNavigate("/billing")}>
				<CreditCardIcon className="size-4 shrink-0" />
				Billing
				{planLabel && (
					<Badge className="ml-auto" size="sm">
						{planLabel}
					</Badge>
				)}
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Item onClick={onCreateClick}>
				<PlusIcon className="size-4 shrink-0" />
				Create Organization
			</DropdownMenu.Item>
		</>
	);
}

export function OrganizationSelector({
	collapsed = false,
}: {
	collapsed?: boolean;
}) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const {
		organizations,
		activeOrganization,
		isLoading,
		isSwitchingOrganization,
	} = useOrganizationsContext();
	const { currentPlanId } = useBillingContext();
	const hydrated = useHydrated();
	const [isOpen, setIsOpen] = useState(false);
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [query, setQuery] = useState("");
	const setPendingActiveOrganizationId = useSetAtom(
		pendingActiveOrganizationIdAtom
	);

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

		setPendingActiveOrganizationId(organizationId);
		setIsOpen(false);

		const { error } = await authClient.organization.setActive({
			organizationId,
		});

		if (error) {
			toast.error(error.message || "Failed to switch organization");
			setPendingActiveOrganizationId(null);
			return;
		}

		queryClient.removeQueries({ queryKey: orpc.websites.key() });
		queryClient.removeQueries({ queryKey: orpc.links.list.key() });
		queryClient.removeQueries({ queryKey: orpc.linkFolders.list.key() });
		queryClient.removeQueries({ queryKey: orpc.apikeys.list.key() });

		await queryClient.invalidateQueries({
			queryKey: AUTH_QUERY_KEYS.activeOrganization,
		});
		queryClient.invalidateQueries();

		toast.success("Organization updated");
	};

	const filteredOrganizations = filterOrganizations(organizations, query);

	const isSwitching = isSwitchingOrganization;
	const activeOrganizationName = activeOrganization?.name ?? "Organization";
	const organizationTriggerLabel = isSwitching
		? `Switching workspace from ${activeOrganizationName}`
		: `Organization: ${activeOrganizationName}`;
	const avatarUrl = getDicebearUrl(
		activeOrganization?.logo || activeOrganization?.id
	);

	const dropdownItems = (
		<OrgDropdownItems
			activeId={activeOrganization?.id}
			onCreateClick={() => {
				setShowCreateDialog(true);
				setIsOpen(false);
			}}
			onNavigate={navigateTo}
			onSelect={handleSelectOrganization}
			organizations={filteredOrganizations}
			planLabel={planLabel}
		/>
	);

	if (!hydrated || isLoading) {
		return (
			<div className={cn("px-2 py-2", collapsed && "px-1.5")}>
				<div
					className={cn(
						"flex items-center gap-2.5 rounded bg-sidebar-accent/50",
						collapsed ? "size-9 justify-center" : "h-9 px-2.5"
					)}
				>
					<Skeleton className="size-6 shrink-0 rounded" />
					{!collapsed && <Skeleton className="h-3.5 w-24 rounded" />}
				</div>
			</div>
		);
	}

	if (collapsed) {
		return (
			<>
				<div className="px-1.5 py-2">
					<DropdownMenu
						onOpenChange={(open) => {
							setIsOpen(open);
							if (!open) {
								setQuery("");
							}
						}}
						open={isOpen}
					>
						<Tooltip
							content={activeOrganization?.name ?? "Organization"}
							side="right"
						>
							<DropdownMenu.Trigger
								aria-label={organizationTriggerLabel}
								className="flex size-9 items-center justify-center rounded bg-sidebar-accent/50 hover:bg-sidebar-accent"
								disabled={isSwitching}
								render={<button type="button" />}
							>
								<Avatar
									alt={activeOrganization?.name ?? "Organization"}
									className="size-6 shrink-0 rounded ring-1 ring-black/10 ring-inset"
									src={avatarUrl}
								/>
							</DropdownMenu.Trigger>
						</Tooltip>
						<DropdownMenu.Content
							align="start"
							className="w-56"
							side="right"
							sideOffset={8}
						>
							{dropdownItems}
						</DropdownMenu.Content>
					</DropdownMenu>
				</div>
				<CreateOrganizationDialog
					isOpen={showCreateDialog}
					onClose={() => setShowCreateDialog(false)}
				/>
			</>
		);
	}

	return (
		<>
			<div className="px-2 py-2">
				<DropdownMenu
					onOpenChange={(open) => {
						setIsOpen(open);
						if (!open) {
							setQuery("");
						}
					}}
					open={isOpen}
				>
					<DropdownMenu.Trigger
						aria-label={organizationTriggerLabel}
						className={cn(
							"flex h-9 w-full items-center gap-2.5 rounded bg-sidebar-accent/50 px-2.5",
							"hover:bg-sidebar-accent",
							isSwitching && "cursor-not-allowed opacity-70",
							isOpen && "bg-sidebar-accent"
						)}
						disabled={isSwitching}
						render={<button type="button" />}
					>
						<Avatar
							alt={activeOrganization?.name ?? "Organization"}
							className="size-6 shrink-0 rounded ring-1 ring-black/10 ring-inset"
							src={avatarUrl}
						/>
						<span className="min-w-0 flex-1 truncate text-left font-semibold text-sidebar-foreground text-sm">
							{isSwitching
								? "Switching workspace…"
								: (activeOrganization?.name ?? "Select organization")}
						</span>
						{isSwitching ? (
							<SpinnerGapIcon className="size-3.5 shrink-0 animate-spin text-sidebar-foreground/30" />
						) : (
							<CaretDownIcon
								className={cn(
									"size-3.5 shrink-0 text-sidebar-foreground/30",
									isOpen && "rotate-180"
								)}
							/>
						)}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						align="start"
						className="min-w-60"
						sideOffset={4}
					>
						{dropdownItems}
					</DropdownMenu.Content>
				</DropdownMenu>
			</div>
			<CreateOrganizationDialog
				isOpen={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
			/>
		</>
	);
}
