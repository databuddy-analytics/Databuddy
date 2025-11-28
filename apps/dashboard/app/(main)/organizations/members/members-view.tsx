"use client";

import {
	ArrowClockwiseIcon,
	BookOpenIcon,
	UserPlusIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
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
			<Skeleton className="h-7 w-7" />
		</div>
	);
}

function MembersSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0 lg:border-r">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-muted/30 p-5">
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

	if (isLoading) return <MembersSkeleton />;
	if (error) return <ErrorState onRetry={refetch} />;
	if (!members || members.length === 0) return <EmptyState />;

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				{/* Members List */}
				<div className="flex flex-col border-b lg:border-b-0 lg:border-r">
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

				{/* Sidebar */}
				<aside className="flex flex-col gap-4 bg-muted/30 p-5">
					{/* Invite Button */}
					<Button className="w-full" onClick={() => setShowInviteDialog(true)}>
						<UserPlusIcon className="mr-2" size={16} />
						Invite Member
					</Button>

					{/* Stats Card */}
				<div className="flex items-center gap-3 rounded border bg-background p-4">
					<div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
						<UsersIcon className="text-primary" size={20} weight="duotone" />
					</div>
					<div>
						<p className="font-semibold tabular-nums">{members.length}</p>
						<p className="text-muted-foreground text-sm">
							Team member{members.length !== 1 ? "s" : ""}
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
						Admins can manage settings and invite members. Members have
						read-only access to analytics.
					</p>
				</div>
			</aside>
			</div>

			<InviteMemberDialog
				onOpenChange={setShowInviteDialog}
				open={showInviteDialog}
				organizationId={organization.id}
			/>
		</>
	);
}
