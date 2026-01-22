"use client";

import {
	ArrowClockwiseIcon,
	CheckIcon,
	ClockIcon,
	EnvelopeIcon,
	UserPlusIcon,
	XIcon,
} from"@phosphor-icons/react";
import { useState } from"react";
import { EmptyState } from"@/components/empty-state";
import { InviteMemberDialog } from"@/components/organizations/invite-member-dialog";
import { RightSidebar } from"@/components/right-sidebar";
import { Button } from"@/components/ui/button";
import { Skeleton } from"@/components/ui/skeleton";
import {
	Tabs,
	TabsBadge,
	TabsContent,
	TabsList,
	TabsTrigger,
} from"@/components/ui/tabs";
import { useOrganizationInvitations } from"@/hooks/use-organization-invitations";
import type {
	ActiveOrganization,
	Organization,
} from"@/hooks/use-organizations";
import { InvitationList } from"./invitation-list";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="size-8" />
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
		<div className="flex h-full flex-col">
			<div className="flex h-10 shrink-0 gap-4 border-b bg-accent/30 px-3">
				<Skeleton className="my-2 h-6 w-24" />
				<Skeleton className="my-2 h-6 w-24" />
				<Skeleton className="my-2 h-6 w-24" />
			</div>
			<div className="flex-1 lg:grid lg:grid-cols-[1fr_18rem]">
				<div className="divide-y border-b lg:border-b-0">
					<SkeletonRow />
					<SkeletonRow />
					<SkeletonRow />
				</div>
				<div className="space-y-4 bg-card p-5">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-18 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</div>
		</div>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex size-16 items-center justify-center bg-destructive/10">
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

function TabEmptyState({ type }: { type:"pending" |"expired" |"accepted" }) {
	const config = {
		pending: {
			icon: ClockIcon,
			title:"No pending invitations",
			description:"All sent invitations have been responded to",
		},
		expired: {
			icon: XIcon,
			title:"No expired invitations",
			description:"Great! No invitations have expired",
		},
		accepted: {
			icon: CheckIcon,
			title:"No accepted invitations",
			description:"Accepted invitations will appear here",
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
				label:"Invite Member",
				onClick: setShowInviteMemberDialog,
				size:"sm",
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
			<Tabs
				className="flex h-full flex-col gap-0"
				onValueChange={setTab}
				value={selectedTab}
				variant="navigation"
			>
				<TabsList>
					<TabsTrigger value="pending">
						<ClockIcon weight="duotone" />
						Pending
						{pendingCount > 0 && (
							<TabsBadge forValue="pending">{pendingCount}</TabsBadge>
						)}
					</TabsTrigger>
					<TabsTrigger value="expired">
						<XIcon weight="bold" />
						Expired
						{expiredCount > 0 && (
							<TabsBadge forValue="expired">{expiredCount}</TabsBadge>
						)}
					</TabsTrigger>
					<TabsTrigger value="accepted">
						<CheckIcon weight="bold" />
						Accepted
						{acceptedCount > 0 && (
							<TabsBadge forValue="accepted">{acceptedCount}</TabsBadge>
						)}
					</TabsTrigger>
				</TabsList>

				<div className="min-h-0 flex-1 lg:grid lg:grid-cols-[1fr_18rem]">
					<div className="flex flex-col overflow-y-auto border-b lg:border-b-0">
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

					<RightSidebar className="gap-4 p-5">
						<Button
							className="w-full"
							onClick={() => setShowInviteDialog(true)}
						>
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
			</Tabs>

			<InviteMemberDialog
				onOpenChange={setShowInviteDialog}
				open={showInviteDialog}
				organizationId={organization.id}
			/>
		</>
	);
}
