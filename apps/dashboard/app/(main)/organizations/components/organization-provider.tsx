"use client";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
	BuildingsIcon,
	EnvelopeIcon,
	GearIcon,
	GlobeIcon,
	KeyIcon,
	UsersIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useAtomValue } from "jotai";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	activeOrganizationAtom,
	isLoadingOrganizationsAtom,
} from "@/stores/jotai/organizationsAtoms";

type PageInfo = {
	title: string;
	description: string;
	icon: PhosphorIcon;
	requiresOrg?: boolean;
};

const PAGE_INFO_MAP: Record<string, PageInfo> = {
	"/organizations": {
		title: "Organizations",
		description: "Manage your organizations and team collaboration",
		icon: BuildingsIcon,
	},
	"/organizations/members": {
		title: "Team Members",
		description: "Manage team members and their roles",
		icon: UsersIcon,
		requiresOrg: true,
	},
	"/organizations/invitations": {
		title: "Pending Invitations",
		description: "View and manage pending team invitations",
		icon: EnvelopeIcon,
		requiresOrg: true,
	},
	"/organizations/settings": {
		title: "General Settings",
		description: "Manage organization name, slug, and basic settings",
		icon: GearIcon,
		requiresOrg: true,
	},
	"/organizations/settings/websites": {
		title: "Website Management",
		description: "Manage websites associated with this organization",
		icon: GlobeIcon,
		requiresOrg: true,
	},
	"/organizations/settings/api-keys": {
		title: "API Keys",
		description: "Create and manage API keys for this organization",
		icon: KeyIcon,
		requiresOrg: true,
	},
	"/organizations/settings/danger": {
		title: "Danger Zone",
		description: "Irreversible and destructive actions",
		icon: WarningIcon,
		requiresOrg: true,
	},
};

const DEFAULT_PAGE_INFO: PageInfo = {
	title: "Organizations",
	description: "Manage your organizations and team collaboration",
	icon: BuildingsIcon,
};

export function OrganizationProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	// Subscribe directly to atoms - no hook overhead
	const activeOrganization = useAtomValue(activeOrganizationAtom);
	const isLoading = useAtomValue(isLoadingOrganizationsAtom);

	const pathname = usePathname();
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showInviteMemberDialog, setShowInviteMemberDialog] = useState(false);

	const {
		title,
		description,
		icon: Icon,
		requiresOrg,
	} = useMemo(() => PAGE_INFO_MAP[pathname] ?? DEFAULT_PAGE_INFO, [pathname]);

	if (isLoading) {
		return (
			<div className="flex h-full flex-col">
				<div className="border-b bg-linear-to-r from-background via-background to-muted/20">
					<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-3 sm:gap-4">
								<div className="rounded border border-primary/20 bg-primary/10 p-2 sm:p-3">
									<Skeleton className="h-5 w-5 sm:h-6 sm:w-6" />
								</div>
								<div>
									<Skeleton className="h-6 w-32 sm:h-8 sm:w-48" />
									<Skeleton className="mt-1 h-3 w-48 sm:h-4 sm:w-64" />
								</div>
							</div>
						</div>
					</div>
				</div>
				<main className="flex-1 overflow-y-auto p-4 sm:p-6">
					<Skeleton className="h-32 w-full sm:h-48" />
					<Skeleton className="h-24 w-full sm:h-32" />
					<Skeleton className="h-20 w-full sm:h-24" />
				</main>
			</div>
		);
	}

	if (requiresOrg && !activeOrganization) {
		return (
			<div className="flex h-full flex-col">
				<div className="border-b bg-linear-to-r from-background via-background to-muted/20">
					<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-3 sm:gap-4">
								<div className="rounded border border-primary/20 bg-primary/10 p-2 sm:p-3">
									<Icon
										className="h-5 w-5 text-primary sm:h-6 sm:w-6"
										size={20}
										weight="duotone"
									/>
								</div>
								<div>
									<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl lg:text-3xl">
										{title}
									</h1>
									<p className="mt-1 text-muted-foreground text-xs sm:text-sm lg:text-base">
										{description}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<main className="flex flex-1 items-center justify-center p-4 sm:p-6">
					<div className="w-full max-w-md rounded-lg border bg-card p-6 text-center sm:p-8">
						<Icon
							className="mx-auto mb-3 h-10 w-10 text-muted-foreground sm:mb-4 sm:h-12 sm:w-12"
							size={40}
							weight="duotone"
						/>
						<h3 className="mb-2 font-semibold text-base sm:text-lg">
							Select an Organization
						</h3>
						<p className="text-muted-foreground text-xs sm:text-sm">
							This feature requires an active organization.
						</p>
						<div className="mt-4 sm:mt-6">
							<Button
								className="rounded text-xs sm:text-sm"
								onClick={() => setShowCreateDialog(true)}
								size="default"
							>
								<BuildingsIcon
									className="mr-2 h-4 w-4 sm:h-5 sm:w-5"
									size={16}
								/>
								Create organization
							</Button>
						</div>
					</div>
				</main>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<div className="h-22 border-b bg-linear-to-r from-background via-background to-muted/20">
				<div className="flex flex-col justify-between gap-2.5 p-3 sm:flex-row sm:items-center sm:gap-0 sm:px-5 sm:py-4">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2.5">
							<div className="rounded border border-primary/20 bg-primary/10 p-2">
								<Icon
									className="h-5 w-5 text-primary"
									size={20}
									weight="duotone"
								/>
							</div>
							<div>
								<h1 className="truncate font-bold text-foreground text-lg tracking-tight sm:text-xl">
									{title}
								</h1>
								<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
									{description}
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			<main className="flex-1 overflow-y-auto">{children}</main>

			<CreateOrganizationDialog
				isOpen={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
			/>

			{activeOrganization && (
				<InviteMemberDialog
					onOpenChange={setShowInviteMemberDialog}
					open={showInviteMemberDialog}
					organizationId={activeOrganization.id}
				/>
			)}
		</div>
	);
}
