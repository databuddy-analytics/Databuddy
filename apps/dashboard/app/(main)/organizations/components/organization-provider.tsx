"use client";

import { useAtomValue } from "jotai";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
import {
	activeOrganizationAtom,
	isLoadingOrganizationsAtom,
} from "@/stores/jotai/organizationsAtoms";
import {
	BuildingsIcon,
	EnvelopeIcon,
	GearIcon,
	GlobeIcon,
	PlugIcon,
	UsersIcon,
} from "@databuddy/ui/icons";
import { Button, EmptyState, Skeleton } from "@databuddy/ui";

type IconComponent = React.ForwardRefExoticComponent<
	React.SVGProps<SVGSVGElement> & React.RefAttributes<SVGSVGElement>
>;

interface HeaderActionButton {
	action: () => void;
	disabled?: boolean;
	icon: IconComponent;
	text: string;
}

interface PageInfo {
	actionButton?: HeaderActionButton;
	description: string;
	icon: IconComponent;
	requiresOrg?: boolean;
	title: string;
}

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
	"/organizations/settings/integrations": {
		title: "Integrations",
		description: "Connect external tools to this organization",
		icon: PlugIcon,
		requiresOrg: true,
	},
	"/organizations/settings/websites": {
		title: "Website Management",
		description: "Manage websites associated with this organization",
		icon: GlobeIcon,
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

	const { title, requiresOrg, actionButton } = useMemo(
		() => PAGE_INFO_MAP[pathname] ?? DEFAULT_PAGE_INFO,
		[pathname]
	);

	if (isLoading) {
		return (
			<div className="flex h-full flex-col">
				<div className="border-b">
					<div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:gap-0 sm:px-6 sm:py-6">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-3 sm:gap-4">
								<div className="rounded border border-accent bg-accent/50 p-2 sm:p-3">
									<Skeleton className="size-5 sm:size-6" />
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
				<TopBar.Title>
					<h1 className="font-semibold text-sm">{title}</h1>
				</TopBar.Title>
				{actionButton && (
					<TopBar.Actions>
						<Button
							disabled={actionButton.disabled}
							onClick={actionButton.action}
							size="sm"
						>
							<actionButton.icon className="size-4 shrink-0" />
							{actionButton.text}
						</Button>
					</TopBar.Actions>
				)}

				<CreateOrganizationDialog
					isOpen={showCreateDialog}
					onClose={() => setShowCreateDialog(false)}
				/>

				<EmptyState
					action={{
						label: "Create Organization",
						onClick: () => setShowCreateDialog(true),
					}}
					description="This feature requires an active organization."
					icon={<BuildingsIcon size={16} weight="duotone" />}
					title="No organization selected"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">{title}</h1>
			</TopBar.Title>
			{actionButton && (
				<TopBar.Actions>
					<Button
						disabled={actionButton.disabled}
						onClick={actionButton.action}
						size="sm"
					>
						<actionButton.icon className="size-4 shrink-0" />
						{actionButton.text}
					</Button>
				</TopBar.Actions>
			)}

			<main className="flex-1 overflow-y-auto">{children}</main>

			<CreateOrganizationDialog
				isOpen={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
			/>

			{activeOrganization && (
				<InviteMemberDialog
					onOpenChangeAction={setShowInviteMemberDialog}
					open={showInviteMemberDialog}
					organizationId={activeOrganization.id}
				/>
			)}
		</div>
	);
}
