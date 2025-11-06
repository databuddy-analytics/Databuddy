import { authClient } from "@databuddy/auth/client";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { OrganizationRole } from "@/hooks/use-organizations";
import { trpc } from "@/lib/trpc";
import {
	acceptedCountAtom,
	expiredCountAtom,
	filteredInvitationsAtom,
	type Invitation,
	type InvitationTab,
	invitationsAtom,
	isCancellingInvitationAtom,
	isInvitingMemberAtom,
	isLoadingInvitationsAtom,
	pendingCountAtom,
	selectedTabAtom,
} from "@/stores/jotai/organizationAtoms";

export function useOrganizationInvitations(organizationId: string) {
	const [invitations, setInvitations] = useAtom(invitationsAtom);
	const [filteredInvitations] = useAtom(filteredInvitationsAtom);
	const [isLoading, setIsLoading] = useAtom(isLoadingInvitationsAtom);
	const [selectedTab, setSelectedTab] = useAtom(selectedTabAtom);
	const [isInviting, setIsInviting] = useAtom(isInvitingMemberAtom);
	const [isCancelling, setIsCancelling] = useAtom(isCancellingInvitationAtom);

	const [pendingCount] = useAtom(pendingCountAtom);
	const [expiredCount] = useAtom(expiredCountAtom);
	const [acceptedCount] = useAtom(acceptedCountAtom);

	const {
		data,
		isLoading: queryLoading,
		refetch,
	} = trpc.organizations.getPendingInvitations.useQuery(
		{ organizationId, includeExpired: true },
		{ enabled: !!organizationId }
	);

	useEffect(() => {
		setIsLoading(queryLoading);
		if (data) {
			setInvitations(data as Invitation[]);
		}
	}, [data, queryLoading, setInvitations, setIsLoading]);

	const fetchInvitations = useCallback(() => {
		refetch();
	}, [refetch]);

	// Invite member
	const inviteMember = useCallback(
		async (inviteData: {
			email: string;
			role: OrganizationRole;
			organizationId?: string;
		}) => {
			setIsInviting(true);
			try {
				const { error } = await authClient.organization.inviteMember({
					email: inviteData.email,
					role: inviteData.role,
					organizationId: inviteData.organizationId || organizationId,
				});

				if (error) {
					throw new Error(error.message);
				}

				toast.success("Member invited successfully");
				// Refresh invitations
				fetchInvitations();
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to invite member"
				);
				throw error;
			} finally {
				setIsInviting(false);
			}
		},
		[organizationId, setIsInviting, fetchInvitations]
	);

	// Cancel invitation
	const cancelInvitation = useCallback(
		async (invitationId: string) => {
			setIsCancelling(true);
			try {
				const { error } = await authClient.organization.cancelInvitation({
					invitationId,
				});

				if (error) {
					throw new Error(error.message);
				}

				toast.success("Invitation cancelled successfully");
				// Refresh invitations
				await fetchInvitations();
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to cancel invitation"
				);
				throw error;
			} finally {
				setIsCancelling(false);
			}
		},
		[setIsCancelling, fetchInvitations]
	);

	const setTab = useCallback(
		(tab: InvitationTab | string) => {
			setSelectedTab(tab as InvitationTab);
		},
		[setSelectedTab]
	);

	return {
		invitations,
		filteredInvitations,
		isLoading,
		selectedTab,
		isInviting,
		isCancelling,
		pendingCount,
		expiredCount,
		acceptedCount,
		inviteMember,
		cancelInvitation,
		setTab,
		refetch: fetchInvitations,
	};
}
