'use client';

import { ClockIcon, EnvelopeIcon } from '@phosphor-icons/react';
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
	useOrganizationInvitations,
} from '@/hooks/use-organizations';
import { InvitationList } from '../[slug]/components/invitation-list';

const ViewSkeleton = () => (
	<div className="space-y-6">
		<Skeleton className="h-48 w-full" />
	</div>
);

export function InvitationsOnlyView({
	organization,
}: {
	organization: NonNullable<Organization | ActiveOrganization>;
}) {
	const {
		invitations,
		isLoading: isLoadingInvitations,
		cancelInvitation,
		isCancellingInvitation,
		error: invitationsError,
	} = useOrganizationInvitations(organization.id);

	if (isLoadingInvitations) {
		return <ViewSkeleton />;
	}

	if (invitationsError) {
		return (
			<div className="rounded border py-12 text-center">
				<p className="text-destructive">Failed to load invitations.</p>
				<p className="text-muted-foreground text-sm">
					{invitationsError?.message}
				</p>
			</div>
		);
	}

	if (!invitations || invitations.length === 0) {
		return (
			<div className="py-12 text-center">
				<Card className="mx-auto max-w-md">
					<CardContent className="p-8">
						<div className="mx-auto mb-6 w-fit rounded-full border border-primary/20 bg-primary/10 p-4">
							<EnvelopeIcon
								className="h-8 w-8 text-primary"
								size={32}
								weight="duotone"
							/>
						</div>
						<CardTitle className="mb-3 text-xl">
							No Pending Invitations
						</CardTitle>
						<CardDescription className="mb-6 text-base">
							There are no pending invitations for this organization. All
							invited members have either joined or declined.
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
					<div className="mb-4 flex items-center gap-2">
						<ClockIcon
							className="h-5 w-5 text-primary"
							size={20}
							weight="duotone"
						/>
						<h3 className="font-semibold text-lg">
							Pending Invitations ({invitations.length})
						</h3>
					</div>
					<InvitationList
						invitations={invitations}
						isCancellingInvitation={isCancellingInvitation}
						onCancelInvitation={cancelInvitation}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
