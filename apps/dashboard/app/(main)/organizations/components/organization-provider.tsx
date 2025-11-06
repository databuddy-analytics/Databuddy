"use client";

import {
	BuildingsIcon,
	EnvelopeIcon,
	GearIcon,
	GlobeIcon,
	KeyIcon,
	PlusIcon,
	UserPlusIcon,
	UsersIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations } from "@/hooks/use-organizations";

export function OrganizationProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { activeOrganization, isLoading } = useOrganizations();
	const pathname = usePathname();
	const [showCreateDialog, setShowCreateDialog] = useState(false);
	const [showInviteMemberDialog, setShowInviteMemberDialog] = useState(false);

	const getPageInfo = () => {
		if (pathname === "/organizations") {
			return {
				title: "Organizations",
				description: "Manage your organizations and team collaboration",
				icon: BuildingsIcon,
				actionButton: {
					text: "New Organization",
					icon: PlusIcon,
					action: () => setShowCreateDialog(true),
				},
			};
		}
		if (pathname === "/organizations/members") {
			return {
				title: "Team Members",
				description: "Manage team members and their roles",
				icon: UsersIcon,
				requiresOrg: true,
				actionButton: {
					text: "Invite Member",
					icon: UserPlusIcon,
					action: () => setShowInviteMemberDialog(true),
				},
			};
		}
		if (pathname === "/organizations/invitations") {
			return {
				title: "Pending Invitations",
				description: "View and manage pending team invitations",
				icon: EnvelopeIcon,
				requiresOrg: true,
				actionButton: {
					text: "Send Invitation",
					icon: UserPlusIcon,
					action: () => setShowInviteMemberDialog(true),
				},
			};
		}
		if (pathname === "/organizations/settings") {
			return {
				title: "General Settings",
				description: "Manage organization name, slug, and basic settings",
				icon: GearIcon,
				requiresOrg: true,
			};
		}
		if (pathname === "/organizations/settings/websites") {
			return {
				title: "Website Management",
				description: "Manage websites associated with this organization",
				icon: GlobeIcon,
				requiresOrg: true,
			};
		}
		if (pathname === "/organizations/settings/api-keys") {
			return {
				title: "API Keys",
				description: "Create and manage API keys for this organization",
				icon: KeyIcon,
				requiresOrg: true,
			};
		}
		if (pathname === "/organizations/settings/danger") {
			return {
				title: "Danger Zone",
				description: "Irreversible and destructive actions",
				icon: WarningIcon,
				requiresOrg: true,
			};
		}
		return {
			title: "Organizations",
			description: "Manage your organizations and team collaboration",
			icon: BuildingsIcon,
			actionButton: {
				text: "New Organization",
				icon: PlusIcon,
				action: () => setShowCreateDialog(true),
			},
		};
	};

	const {
		title,
		description,
		icon: Icon,
		requiresOrg,
		actionButton,
	} = getPageInfo();

	if (isLoading) {
		return (
			<div className="flex h-full flex-col">
				<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
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
				<div className="border-b bg-gradient-to-r from-background via-background to-muted/20">
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
						{actionButton && (
							<Button
								className="w-full rounded text-xs sm:w-auto sm:text-sm"
								onClick={actionButton.action}
								size="sm"
							>
								<actionButton.icon
									className="mr-2 h-3 w-3 sm:h-4 sm:w-4"
									size={12}
								/>
								{actionButton.text}
							</Button>
						)}
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
			<div className="h-22 border-b bg-gradient-to-r from-background via-background to-muted/20">
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
					{actionButton && (
						<Button
							className="w-full rounded text-xs sm:w-auto sm:text-sm"
							onClick={actionButton.action}
							size="sm"
						>
							<actionButton.icon
								className="mr-2 h-3 w-3 sm:h-4 sm:w-4"
								size={12}
							/>
							{actionButton.text}
						</Button>
					)}
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
