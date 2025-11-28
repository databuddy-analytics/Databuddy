"use client";

import {
	ArrowClockwiseIcon,
	BookOpenIcon,
	CheckIcon,
	ClockIcon,
	EnvelopeIcon,
	UserPlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
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
			<Skeleton className="h-8 w-8 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-3 w-32" />
			</div>
			<Skeleton className="h-7 w-7" />
		</div>
	);
}

function InvitationsSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="border-b lg:border-b-0 lg:border-r">
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
			<div className="space-y-4 bg-muted/30 p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex h-full flex-col items-center justify-center p-8 text-center">
			<div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
				<EnvelopeIcon className="text-primary" size={28} weight="duotone" />
			</div>
			<h3 className="mb-1 font-semibold text-lg">No invitations</h3>
			<p className="mb-6 max-w-sm text-muted-foreground text-sm">
				Invite team members to start collaborating
			</p>
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

	if (isLoading) return <InvitationsSkeleton />;
	if (error) return <ErrorState onRetry={refetch} />;

	const totalCount = pendingCount + expiredCount + acceptedCount;
	if (totalCount === 0) return <EmptyState />;

	return (
		<>
			<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
				{/* Main Content */}
				<div className="flex flex-col border-b lg:border-b-0 lg:border-r">
					<Tabs
						className="flex h-full flex-col"
						onValueChange={setTab}
						value={selectedTab}
					>
						{/* Tabs */}
						<div className="border-b px-5">
							<TabsList className="h-10 w-full justify-start gap-2 bg-transparent p-0">
								<TabsTrigger
									className="h-10 rounded-none border-transparent border-b-2 bg-transparent px-3 data-[state=active]:border-primary data-[state=active]:shadow-none"
									value="pending"
								>
									<ClockIcon className="mr-1.5" size={14} weight="duotone" />
									Pending
									{pendingCount > 0 && (
										<span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-amber-600 text-xs">
											{pendingCount}
										</span>
									)}
								</TabsTrigger>
								<TabsTrigger
									className="h-10 rounded-none border-transparent border-b-2 bg-transparent px-3 data-[state=active]:border-primary data-[state=active]:shadow-none"
									value="expired"
								>
									<XIcon className="mr-1.5" size={14} weight="bold" />
									Expired
									{expiredCount > 0 && (
										<span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
											{expiredCount}
										</span>
									)}
								</TabsTrigger>
								<TabsTrigger
									className="h-10 rounded-none border-transparent border-b-2 bg-transparent px-3 data-[state=active]:border-primary data-[state=active]:shadow-none"
									value="accepted"
								>
									<CheckIcon className="mr-1.5" size={14} weight="bold" />
									Accepted
									{acceptedCount > 0 && (
										<span className="ml-1.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-green-600 text-xs">
											{acceptedCount}
										</span>
									)}
								</TabsTrigger>
							</TabsList>
						</div>

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
				<aside className="flex flex-col gap-4 bg-muted/30 p-5">
					{/* Invite Button */}
					<Button className="w-full" onClick={() => setShowInviteDialog(true)}>
						<UserPlusIcon className="mr-2" size={16} />
						Send Invitation
					</Button>

					{/* Stats Card */}
					<div className="flex items-center gap-3 rounded border bg-background p-4">
						<div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
							<EnvelopeIcon className="text-primary" size={20} weight="duotone" />
						</div>
						<div>
							<p className="font-semibold tabular-nums">
								{pendingCount}{" "}
								<span className="font-normal text-muted-foreground">/ {totalCount}</span>
							</p>
							<p className="text-muted-foreground text-sm">Pending</p>
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
							Invitations expire after 7 days. Resend if needed from the pending
							tab.
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
