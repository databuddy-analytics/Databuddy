"use client";

import { authClient } from "@databuddy/auth/client";
import {
	BuildingsIcon,
	CaretRightIcon,
	CheckCircleIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CreateOrganizationDialog } from "@/components/organizations/create-organization-dialog";
import type { Organization } from "@/components/providers/organizations-provider";
import { RightSidebar } from "@/components/right-sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getOrganizationInitials } from "@/lib/utils";

dayjs.extend(relativeTime);

type OrganizationsListProps = {
	organizations: Organization[] | null | undefined;
	activeOrganization: Organization | null | undefined;
};

function EmptyState() {
	const [showCreateOrganizationDialog, setShowCreateOrganizationDialog] =
		useState(false);

	return (
		<>
			<div className="flex h-full flex-col items-center justify-center p-8 text-center">
				<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
					<BuildingsIcon className="text-primary" size={28} weight="duotone" />
				</div>
				<h3 className="mb-1 font-semibold text-lg">No organizations yet</h3>
				<p className="mb-6 max-w-sm text-muted-foreground text-sm">
					Create your first organization to collaborate with your team
				</p>
				<Button onClick={() => setShowCreateOrganizationDialog(true)}>
					Create Organization
				</Button>
			</div>

			<CreateOrganizationDialog
				isOpen={showCreateOrganizationDialog}
				onClose={() => setShowCreateOrganizationDialog(false)}
			/>
		</>
	);
}

type OrganizationRowProps = {
	organization: Organization;
	isActive: boolean;
	isProcessing: boolean;
	onClick: () => void;
};

function OrganizationRow({
	organization,
	isActive,
	isProcessing,
	onClick,
}: OrganizationRowProps) {
	return (
		<button
			className={cn(
				"group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-3 text-left hover:bg-accent",
				isProcessing && "pointer-events-none opacity-60"
			)}
			onClick={onClick}
			type="button"
		>
			{isProcessing && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/50">
					<div className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
				</div>
			)}

			<Avatar className="size-10">
				<AvatarImage
					alt={organization.name}
					src={organization.logo ?? undefined}
				/>
				<AvatarFallback className="bg-accent text-sm">
					{getOrganizationInitials(organization.name)}
				</AvatarFallback>
			</Avatar>

			<div className="min-w-0">
				<p className="truncate font-medium">{organization.name}</p>
				<p className="truncate text-muted-foreground text-sm">
					@{organization.slug} · {dayjs(organization.createdAt).fromNow()}
				</p>
			</div>

			{isActive && (
				<Badge variant="green">
					<CheckCircleIcon className="mr-1" size={12} weight="fill" />
					Active
				</Badge>
			)}

			<CaretRightIcon
				className="text-accent-foreground transition-all group-hover:translate-x-0.5"
				size={16}
				weight="bold"
			/>
		</button>
	);
}

export function OrganizationsList({
	organizations,
	activeOrganization,
}: OrganizationsListProps) {
	const router = useRouter();
	const [processingId, setProcessingId] = useState<string | null>(null);
	const [showCreateOrganizationDialog, setShowCreateOrganizationDialog] =
		useState(false);
	const handleOrgClick = async (orgId: string) => {
		const isCurrentlyActive = activeOrganization?.id === orgId;

		if (isCurrentlyActive) {
			router.push("/organizations/settings");
			return;
		}

		setProcessingId(orgId);
		try {
			const { error } = await authClient.organization.setActive({
				organizationId: orgId,
			});
			if (error) {
				toast.error(error.message ?? "Failed to switch workspace");
			} else {
				toast.success("Workspace updated");
				await new Promise((resolve) => setTimeout(resolve, 300));
				router.push("/organizations/settings");
			}
		} catch {
			toast.error("Failed to switch workspace");
		} finally {
			setProcessingId(null);
		}
	};

	if (!organizations || organizations.length === 0) {
		return <EmptyState />;
	}

	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			{/* Organizations List */}
			<div className="flex flex-col border-b lg:border-b-0">
				<div className="flex-1 divide-y overflow-y-auto">
					{organizations.map((org) => (
						<OrganizationRow
							isActive={activeOrganization?.id === org.id}
							isProcessing={processingId === org.id}
							key={org.id}
							onClick={() => handleOrgClick(org.id)}
							organization={org}
						/>
					))}
				</div>
			</div>

			{/* Sidebar */}
			<RightSidebar className="gap-4 p-5">
				<Button
					className="w-full"
					onClick={() => setShowCreateOrganizationDialog(true)}
				>
					<PlusIcon size={16} />
					New Organization
				</Button>
				<CreateOrganizationDialog
					isOpen={showCreateOrganizationDialog}
					onClose={() => setShowCreateOrganizationDialog(false)}
				/>
				<RightSidebar.DocsLink />
				<RightSidebar.Tip description="Click on an organization to switch to it. The active organization is used across the dashboard." />
			</RightSidebar>
		</div>
	);
}
