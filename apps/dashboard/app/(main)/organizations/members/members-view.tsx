"use client";

import { InviteMemberDialog } from "@/components/organizations/invite-member-dialog";
import {
	type ActiveOrganization,
	type Organization,
	useOrganizationMembers,
} from "@/hooks/use-organizations";
import {
	ArrowClockwiseIcon,
	UserPlusIcon,
	UsersIcon,
} from "@databuddy/ui/icons";
import { useState } from "react";
import { MembersSkeleton } from "../components/settings-skeletons";
import { MemberList } from "./member-list";
import { Button, Card, EmptyState } from "@databuddy/ui";

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
						description="Something went wrong while loading team members"
						icon={<UsersIcon />}
						title="Failed to load"
					/>
				</Card.Content>
			</Card>
		);
	}

	const isEmpty = !members || members.length === 0;

	return (
		<>
			<Card>
				<Card.Header className="flex-row items-start justify-between gap-4">
					<div>
						<Card.Title>Members</Card.Title>
						<Card.Description>
							{isEmpty
								? "Invite people to start collaborating"
								: `${members.length} member${members.length === 1 ? "" : "s"}`}
						</Card.Description>
					</div>
					<Button
						onClick={() => setShowInviteDialog(true)}
						size="sm"
						variant="secondary"
					>
						<UserPlusIcon size={14} />
						Invite
					</Button>
				</Card.Header>
				<Card.Content className="p-0">
					{isEmpty ? (
						<div className="px-5 py-8">
							<EmptyState icon={<UsersIcon />} title="No members yet" />
						</div>
					) : (
						<div className="divide-y">
							<MemberList
								isRemovingMember={isRemovingMember}
								isUpdatingMember={isUpdatingMember}
								members={members}
								onRemoveMember={removeMember}
								onUpdateRole={updateMember}
								organizationId={organization.id}
							/>
						</div>
					)}
				</Card.Content>
			</Card>

			<InviteMemberDialog
				onOpenChangeAction={setShowInviteDialog}
				open={showInviteDialog}
				organizationId={organization.id}
			/>
		</>
	);
}
