'use client';

import {
	CrownIcon,
	EnvelopeIcon,
	type Icon as IconType,
	PlusIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
	type ActiveOrganization,
	type Organization,
	useOrganizationInvitations,
	useOrganizationMembers,
} from '@/hooks/use-organizations';
import { InvitationList } from './invitation-list';
import { InviteMemberDialog } from './invite-member-dialog';
// Import sub-components that will be created next
import { MemberList } from './member-list';

const StatCard = ({
	icon: Icon,
	label,
	value,
}: {
	icon: IconType;
	label: string;
	value: number;
}) => (
	<div className="rounded border border-border/50 bg-muted/30 p-4">
		<div className="flex items-center gap-3">
			<div className="rounded border border-primary/20 bg-primary/10 p-2">
				<Icon className="h-5 w-5 text-primary" size={16} weight="duotone" />
			</div>
			<div>
				<p className="text-muted-foreground text-sm">{label}</p>
				<p className="font-semibold text-xl">{value}</p>
			</div>
		</div>
	</div>
);

const ViewSkeleton = () => (
	<div className="space-y-6">
		<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-24 w-full" />
		</div>
		<div className="flex justify-end">
			<Skeleton className="h-9 w-44" />
		</div>
		<Skeleton className="h-48 w-full" />
		<Skeleton className="h-32 w-full" />
	</div>
);

export function TeamView({
	organization,
}: {
	organization: NonNullable<Organization | ActiveOrganization>;
}) {
	const [showInviteDialog, setShowInviteDialog] = useState(false);

	const {
		members,
		isLoading: isLoadingMembers,
		removeMember,
		isRemovingMember,
		updateMember,
		isUpdatingMember,
		error: membersError,
	} = useOrganizationMembers(organization.id);

	const {
		invitations,
		isLoading: isLoadingInvitations,
		cancelInvitation,
		isCancellingInvitation,
		error: invitationsError,
	} = useOrganizationInvitations(organization.id);

	if (isLoadingMembers || isLoadingInvitations) {
		return <ViewSkeleton />;
	}

	if (membersError || invitationsError) {
		return (
			<div className="rounded border py-12 text-center">
				<p className="text-destructive">Failed to load team data.</p>
				<p className="text-muted-foreground text-sm">
					{(membersError || invitationsError)?.message}
				</p>
			</div>
		);
	}

	const activeInvitations =
		invitations?.filter((inv) => inv.status === 'pending') || [];
	const totalMembers = (members?.length || 0) + activeInvitations.length;

	return (
		<div className="space-y-8">
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<StatCard
					icon={UsersIcon}
					label="Active Members"
					value={members?.length || 0}
				/>
				<StatCard
					icon={EnvelopeIcon}
					label="Pending Invites"
					value={activeInvitations.length}
				/>
				<StatCard
					icon={CrownIcon}
					label="Total Team Size"
					value={totalMembers}
				/>
			</div>

			<div className="flex justify-end">
				<Button className="rounded" onClick={() => setShowInviteDialog(true)}>
					<PlusIcon className="mr-2 h-4 w-4" size={16} />
					Invite Team Member
				</Button>
			</div>

			<MemberList
				isRemovingMember={isRemovingMember}
				isUpdatingMember={isUpdatingMember}
				members={members}
				onRemoveMember={removeMember}
				onUpdateRole={updateMember}
				organizationId={organization.id}
			/>

			<InvitationList
				invitations={activeInvitations}
				isCancellingInvitation={isCancellingInvitation}
				onCancelInvitation={cancelInvitation}
			/>

			<InviteMemberDialog
				isOpen={showInviteDialog}
				onClose={() => setShowInviteDialog(false)}
				organizationId={organization.id}
			/>
		</div>
	);
}
