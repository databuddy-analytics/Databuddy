'use client';

import { UsersIcon } from '@phosphor-icons/react';
import {
	Card,
	CardContent,
	CardDescription,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
	type ActiveOrganization,
	type Organization,
	useOrganizationMembers,
} from '@/hooks/use-organizations';
import { MemberList } from '../[slug]/components/member-list';

const ViewSkeleton = () => (
	<div className="space-y-6">
		<Skeleton className="h-48 w-full" />
	</div>
);

export function MembersOnlyView({
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
		return <ViewSkeleton />;
	}

	if (membersError) {
		return (
			<div className="rounded border py-12 text-center">
				<p className="text-destructive">Failed to load team members.</p>
				<p className="text-muted-foreground text-sm">{membersError?.message}</p>
			</div>
		);
	}

	if (!members || members.length === 0) {
		return (
			<div className="py-12 text-center">
				<Card className="mx-auto max-w-md">
					<CardContent className="p-8">
						<div className="mx-auto mb-6 w-fit rounded-full border border-primary/20 bg-primary/10 p-4">
							<UsersIcon
								className="h-8 w-8 text-primary"
								size={32}
								weight="duotone"
							/>
						</div>
						<CardTitle className="mb-3 text-xl">No Team Members</CardTitle>
						<CardDescription className="mb-6 text-base">
							This organization doesn't have any team members yet. Invite people
							to start collaborating.
						</CardDescription>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardContent className="p-6">
					<MemberList
						isRemovingMember={isRemovingMember}
						isUpdatingMember={isUpdatingMember}
						members={members}
						onRemoveMember={removeMember}
						onUpdateRole={updateMember}
						organizationId={organization.id}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
