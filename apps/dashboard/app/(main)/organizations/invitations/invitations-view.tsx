"use client";

import {
	ArrowClockwiseIcon,
	CheckIcon,
	ClockIcon,
	EnvelopeIcon,
	UserPlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
import { RightSidebar } from "@/components/right-sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganizationInvitations } from "@/hooks/use-organization-invitations";
import type {
	ActiveOrganization,
	Organization,
} from "@/hooks/use-organizations";
import { InvitationList } from "./invitation-list";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="size-8 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-3 w-32" />
			</div>
			<Skeleton className="size-7" />
		</div>
	);
}

function InvitationsSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="border-b lg:border-b-0">
				<div className="flex gap-4 border-b px-5 py-3">
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-24" />
				</div>
				<div className="divide-y">
					<SkeletonRow />
					<SkeletonRow />
					<SkeletonRow />
				</div>
			</div>
			<div className="space-y-4 bg-card p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
				<EnvelopeIcon className="text-destructive" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">Failed to load</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Something went wrong while loading invitations
			</p>
			<Button onClick={onRetry} variant="outline">
				<ArrowClockwiseIcon className="mr-2" size={16} />
				Try again
			</Button>
		</div>
	);
}

function TabEmptyState({ type }: { type: "pending" | "expired" | "accepted" }) {
	const config = {
		pending: {
			icon: ClockIcon,
			title: "No pending invitations",
			description: "All sent invitations have been responded to",
		},
		expired: {
			icon: XIcon,
			title: "No expired invitations",
			description: "Great! No invitations have expired",
		},
		accepted: {
			icon: CheckIcon,
			title: "No accepted invitations",
			description: "Accepted invitations will appear here",
		},
	};

	const { icon: Icon, title, description } = config[type];

	return (
		<div className="flex flex-col items-center justify-center py-12 text-center">
			<Icon className="mb-2 text-muted-foreground/50" size={24} />
			<p className="font-medium text-muted-foreground">{title}</p>
			<p className="mt-1 text-muted-foreground/70 text-sm">{description}</p>
		</div>
	);
}

function EmptyInvitationsState({
	setShowInviteMemberDialog,
}: {
	setShowInviteMemberDialog: () => void;
}) {
	return (
		<EmptyState
			action={{
				label: "Invite Member",
				onClick: setShowInviteMemberDialog,
				size: "sm",
			}}
			description="There are no pending invitations for this organization. All invited members have either joined or declined their invitations."
			icon={<EnvelopeIcon weight="duotone" />}
			title="No Pending Invitations"
			variant="minimal"
		/>
	);
}

export function InvitationsView({
	organization,
}: {
	organization: NonNullable<Organization | ActiveOrganization>;
}) {
	const [showInviteDialog, setShowInviteDialog] = useState(false);
	const {
		filteredInvitations,
		isLoading,
		error,
		selectedTab,
		isCancelling,
		pendingCount,
		expiredCount,
		acceptedCount,
		cancelInvitation,
		setTab,
		refetch,
	} = useOrganizationInvitations(organization.id);

	if (isLoading) {
		return <InvitationsSkeleton />;
	}
	if (error) {
		return <ErrorState onRetry={refetch} />;
	}

	const totalCount = pendingCount + expiredCount + acceptedCount;
	if (totalCount === 0) {
		return (
			<div className="flex h-full flex-col">
				<InviteMemberDialog
					onOpenChange={setShowInviteDialog}
					open={showInviteDialog}
					organizationId={organization.id}
				/>
				<EmptyInvitationsState
					setShowInviteMemberDialog={() => setShowInviteDialog(true)}
				/>
			</div>
		);
	}

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				{/* Main Content */}
				<div className="flex flex-col border-b lg:border-b-0">
					<Tabs
						className="flex h-full flex-col"
						onValueChange={setTab}
						value={selectedTab}
						variant="underline"
					>
						{/* Tabs */}
						<TabsList>
							<TabsTrigger value="pending">
								<ClockIcon className="size-3.5" weight="duotone" />
								Pending
								{pendingCount > 0 && (
									<span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-600 text-xs dark:text-amber-500">
										{pendingCount}
									</span>
								)}
							</TabsTrigger>
							<TabsTrigger value="expired">
								<XIcon className="size-3.5" weight="bold" />
								Expired
								{expiredCount > 0 && (
									<span className="rounded-full bg-secondary px-1.5 py-0.5 text-secondary-foreground text-xs">
										{expiredCount}
									</span>
								)}
							</TabsTrigger>
							<TabsTrigger value="accepted">
								<CheckIcon className="size-3.5" weight="bold" />
								Accepted
								{acceptedCount > 0 && (
									<span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-green-600 text-xs dark:text-green-500">
										{acceptedCount}
									</span>
								)}
							</TabsTrigger>
						</TabsList>

						{/* Content */}
						<div className="flex-1 overflow-y-auto">
							<TabsContent className="m-0 h-full" value="pending">
								{pendingCount > 0 ? (
									<InvitationList
										invitations={filteredInvitations}
										isCancellingInvitation={isCancelling}
										onCancelInvitationAction={cancelInvitation}
									/>
								) : (
									<TabEmptyState type="pending" />
								)}
							</TabsContent>

							<TabsContent className="m-0 h-full" value="expired">
								{expiredCount > 0 ? (
									<InvitationList
										invitations={filteredInvitations}
										isCancellingInvitation={isCancelling}
										onCancelInvitationAction={cancelInvitation}
									/>
								) : (
									<TabEmptyState type="expired" />
								)}
							</TabsContent>

							<TabsContent className="m-0 h-full" value="accepted">
								{acceptedCount > 0 ? (
									<InvitationList
										invitations={filteredInvitations}
										isCancellingInvitation={isCancelling}
										onCancelInvitationAction={cancelInvitation}
									/>
								) : (
									<TabEmptyState type="accepted" />
								)}
							</TabsContent>
						</div>
					</Tabs>
				</div>

				{/* Sidebar */}
				<RightSidebar className="gap-4 p-5">
					<Button className="w-full" onClick={() => setShowInviteDialog(true)}>
						<UserPlusIcon className="mr-2" size={16} />
						Send Invitation
					</Button>
					<RightSidebar.InfoCard
						description="Pending"
						icon={EnvelopeIcon}
						title={`${pendingCount} / ${totalCount}`}
					/>
					<RightSidebar.DocsLink />
					<RightSidebar.Tip description="Invitations expire after 7 days. Resend if needed from the pending tab." />
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
