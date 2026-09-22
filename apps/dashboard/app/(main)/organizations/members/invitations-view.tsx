"use client";

import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
import { useOrganizationInvitations } from "@/hooks/use-organization-invitations";
import type {
	ActiveOrganization,
	Organization,
} from "@/hooks/use-organizations";
import {
	ArrowClockwiseIcon,
	EnvelopeIcon,
	TrashIcon,
	UserPlusIcon,
} from "@databuddy/ui/icons";
import { useState } from "react";
import { InvitationsSkeleton } from "../components/settings-skeletons";
import { InvitationList } from "./invitation-list";
import { Button, Card, EmptyState } from "@databuddy/ui";

export function InvitationsView({
	organization,
}: {
	organization: NonNullable<Organization | ActiveOrganization>;
}) {
	const [showInviteDialog, setShowInviteDialog] = useState(false);
	const {
		invitations,
		isLoading,
		error,
		isCancelling,
		isClearingExpired,
		isResending,
		pendingCount,
		expiredCount,
		cancelInvitation,
		clearExpiredInvitations,
		resendInvitation,
		refetch,
	} = useOrganizationInvitations(organization.id);

	if (isLoading) {
		return <InvitationsSkeleton />;
	}

	if (error) {
		return (
			<Card>
				<Card.Content className="py-12">
					<EmptyState
						action={
							<Button onClick={() => refetch()} variant="secondary">
								<ArrowClockwiseIcon size={14} />
								Try again
							</Button>
						}
						description="Something went wrong while loading invitations"
						icon={<EnvelopeIcon />}
						title="Failed to load"
					/>
				</Card.Content>
			</Card>
		);
	}

	const totalCount = invitations.length;

	return (
		<>
			<Card>
				<Card.Header className="flex-row items-start justify-between gap-4">
					<div>
						<Card.Title>Invitations</Card.Title>
						<Card.Description>
							{totalCount === 0
								? "Invite people to join this organization"
								: `${pendingCount} pending of ${totalCount} total`}
						</Card.Description>
					</div>
					<div className="flex items-center gap-2">
						{expiredCount > 0 && (
							<Button
								loading={isClearingExpired}
								onClick={() => clearExpiredInvitations()}
								size="sm"
								variant="ghost"
							>
								<TrashIcon size={14} />
								Clear expired
							</Button>
						)}
						<Button
							onClick={() => setShowInviteDialog(true)}
							size="sm"
							variant="secondary"
						>
							<UserPlusIcon size={14} />
							Invite
						</Button>
					</div>
				</Card.Header>
				{totalCount > 0 && (
					<Card.Content className="p-0">
						<InvitationList
							invitations={invitations}
							isCancellingInvitation={isCancelling}
							isResending={isResending}
							onCancelInvitationAction={cancelInvitation}
							onResendInvitation={(inv) =>
								resendInvitation({
									email: inv.email,
									role: inv.role ?? "member",
								})
							}
						/>
					</Card.Content>
				)}
			</Card>

			<InviteMemberDialog
				onOpenChangeAction={setShowInviteDialog}
				open={showInviteDialog}
				organizationId={organization.id}
			/>
		</>
	);
}
