"use client";

import {
	ArrowClockwiseIcon,
	UserPlusIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type ActiveOrganization,
	type Organization,
	useOrganizationMembers,
} from "@/hooks/use-organizations";
import { MemberList } from "./member-list";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-10 w-10 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="h-7 w-20" />
			<Skeleton className="size-7" />
		</div>
	);
}

function MembersSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-card p-5">
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-20 w-full rounded" />
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
				<UsersIcon className="text-primary" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">No team members yet</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Invite people to start collaborating with your team
			</p>
		</div>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
				<UsersIcon className="text-destructive" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">Failed to load</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Something went wrong while loading team members
			</p>
			<Button onClick={onRetry} variant="outline">
				<ArrowClockwiseIcon className="mr-2" size={16} />
				Try again
			</Button>
		</div>
	);
}

export function MembersView({
	organization,
}: {
	organization: NonNullable<Organization | ActiveOrganization>;
}) {
	const [showInviteDialog, setShowInviteDialog] = useState(false);
	const {
		members,
		isLoading,
		removeMember,
		isRemovingMember,
		updateMember,
		isUpdatingMember,
		error,
		refetch,
	} = useOrganizationMembers(organization.id);

	if (isLoading) {
		return <MembersSkeleton />;
	}
	if (error) {
		return <ErrorState onRetry={refetch} />;
	}
	if (!members || members.length === 0) {
		return <EmptyState />;
	}

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				{/* Members List */}
				<div className="flex flex-col border-b lg:border-b-0">
					<div className="flex-1 divide-y overflow-y-auto">
						<MemberList
							isRemovingMember={isRemovingMember}
							isUpdatingMember={isUpdatingMember}
							members={members}
							onRemoveMember={removeMember}
							onUpdateRole={updateMember}
							organizationId={organization.id}
						/>
					</div>
				</div>

				<RightSidebar className="gap-4 p-5">
					<Button className="w-full" onClick={() => setShowInviteDialog(true)}>
						<UserPlusIcon className="mr-2" size={16} />
						Invite Member
					</Button>
					<RightSidebar.InfoCard
						description={`Team member${members.length !== 1 ? "s" : ""}`}
						icon={UsersIcon}
						title={String(members.length)}
					/>
					<RightSidebar.DocsLink />
					<RightSidebar.Tip description="Admins can manage settings and invite members. Members have read-only access to analytics." />
				</RightSidebar>
			</div>

			<InviteMemberDialog
				onOpenChange={setShowInviteDialog}
				open={showInviteDialog}
				organizationId={organization.id}
			/>
		</>
	);
}
