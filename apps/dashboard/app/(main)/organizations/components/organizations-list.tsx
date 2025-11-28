"use client";

import { authClient } from "@databuddy/auth/client";
import {
	BookOpenIcon,
	BuildingsIcon,
	CaretRightIcon,
	CheckCircleIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { Organization } from "@/components/providers/organizations-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getOrganizationInitials } from "@/lib/utils";

dayjs.extend(relativeTime);

interface OrganizationsListProps {
	organizations: Organization[] | null | undefined;
	activeOrganization: Organization | null | undefined;
}

function EmptyState() {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
				<BuildingsIcon className="text-primary" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">No organizations yet</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Create your first organization to collaborate with your team
			</p>
			<Button asChild>
				<Link href="/organizations/new">
					<PlusIcon className="mr-2" size={16} />
					Create Organization
				</Link>
			</Button>
		</div>
	);
}

interface OrganizationRowProps {
	organization: Organization;
	isActive: boolean;
	isProcessing: boolean;
	onClick: () => void;
}

function OrganizationRow({
	organization,
	isActive,
	isProcessing,
	onClick,
}: OrganizationRowProps) {
	return (
		<button
			className={cn(
				"group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4 text-left transition-colors",
				isActive ? "bg-primary/5" : "hover:bg-muted/50",
				isProcessing && "pointer-events-none opacity-60"
			)}
			onClick={onClick}
			type="button"
		>
			{isProcessing && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/50">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
				</div>
			)}

			<Avatar className="h-10 w-10 border transition-colors group-hover:border-primary/30">
				<AvatarImage alt={organization.name} src={organization.logo ?? undefined} />
				<AvatarFallback className="bg-accent text-xs">
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
				<Badge className="border-primary/20 bg-primary/10 text-primary" variant="secondary">
					<CheckCircleIcon className="mr-1" size={12} weight="fill" />
					Active
				</Badge>
			)}

			<CaretRightIcon
				className="text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
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
			<div className="flex flex-col border-b lg:border-b-0 lg:border-r">
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
			<aside className="flex flex-col gap-4 bg-muted/30 p-5">
				{/* Create Button */}
				<Button asChild className="w-full">
					<Link href="/organizations/new">
						<PlusIcon className="mr-2" size={16} />
						New Organization
					</Link>
				</Button>

				{/* Stats Card */}
				<div className="flex items-center gap-3 rounded border bg-background p-4">
					<div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
						<BuildingsIcon className="text-primary" size={20} weight="duotone" />
					</div>
					<div>
						<p className="font-semibold tabular-nums">{organizations.length}</p>
						<p className="text-muted-foreground text-sm">
							Organization{organizations.length !== 1 ? "s" : ""}
						</p>
					</div>
				</div>

				{/* Docs Link */}
				<Button asChild className="w-full justify-start" variant="outline">
					<a
						href="https://www.databuddy.cc/docs/getting-started"
						rel="noopener noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="mr-2" size={16} />
						Documentation
					</a>
				</Button>

				{/* Tip */}
				<div className="mt-auto rounded border border-dashed bg-background/50 p-4">
					<p className="mb-2 font-medium text-sm">Quick tip</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						Click on an organization to switch to it. The active organization is
						used across the dashboard.
					</p>
				</div>
			</aside>
		</div>
	);
}
