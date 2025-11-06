"use client";

import { UsersIcon } from "@phosphor-icons/react";

import {
	type ActiveOrganization,
	type Organization,
	useOrganizationMembers,
} from "@/hooks/use-organizations";
import { EmptyState } from "../components/empty-state";
import { ListSkeleton } from "../components/list-skeleton";
import { MemberList } from "./member-list";

function MembersSkeleton() {
	return <ListSkeleton count={6} />;
}

function EmptyMembersState() {
	return (
		<EmptyState
			description="This organization doesn't have any team members yet. Invite people to start collaborating and building together."
			features={[
				{ label: "Assign roles" },
				{ label: "Track activity" },
				{ label: "Share access" },
			]}
			icon={UsersIcon}
			title="Build Your Team"
		/>
	);
}

function ErrorState({ error }: { error: Error }) {
	return (
		<EmptyState
			description={error.message}
			icon={UsersIcon}
			title="Failed to Load Members"
			variant="destructive"
		/>
	);
}

export function MembersView({
	organization,
}: {
	organization: NonNullable<Organization | ActiveOrganization>;
}) {
	const {
		members,
		isLoading: isLoadingMembers,
		removeMember,
		isRemovingMember,
		updateMember,
		isUpdatingMember,
		error: membersError,
	} = useOrganizationMembers(organization.id);

	if (isLoadingMembers) {
		return <MembersSkeleton />;
	}

	if (membersError) {
		return <ErrorState error={membersError} />;
	}

	if (!members || members.length === 0) {
		return <EmptyMembersState />;
	}

	return (
		<div className="h-full p-4 sm:p-6">
			<MemberList
				isRemovingMember={isRemovingMember}
				isUpdatingMember={isUpdatingMember}
				members={members}
				onRemoveMember={removeMember}
				onUpdateRole={updateMember}
				organizationId={organization.id}
			/>
		</div>
	);
}
