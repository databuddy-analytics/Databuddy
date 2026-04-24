import { authClient } from "@databuddy/auth/client";
import type { invitation } from "@databuddy/db/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import type { OrganizationRole } from "@/hooks/use-organizations";
import dayjs from "@/lib/dayjs";
import { orpc } from "@/lib/orpc";

export type Invitation = typeof invitation.$inferSelect;

interface InviteMemberInput {
	email: string;
	organizationId?: string;
	role: OrganizationRole;
}

const EMPTY_INVITATIONS: Invitation[] = [];

export function useOrganizationInvitations(organizationId: string) {
	const queryClient = useQueryClient();

	const listKey = orpc.organizations.getPendingInvitations.key({
		input: { organizationId, includeExpired: true },
	});

	const query = useQuery({
		...orpc.organizations.getPendingInvitations.queryOptions({
			input: { organizationId, includeExpired: true },
		}),
		enabled: !!organizationId,
	});

	const invitations =
		(query.data as Invitation[] | undefined) ?? EMPTY_INVITATIONS;

	const pendingCount = useMemo(
		() =>
			invitations.filter(
				(inv) =>
					inv.status === "pending" && dayjs(inv.expiresAt).isAfter(dayjs())
			).length,
		[invitations]
	);

	const inviteMutation = useMutation({
		mutationFn: async (input: InviteMemberInput) => {
			const { error } = await authClient.organization.inviteMember({
				email: input.email,
				role: input.role,
				organizationId: input.organizationId || organizationId,
			});
			if (error) {
				throw new Error(error.message);
			}
		},
		onSuccess: () => {
			toast.success("Member invited successfully");
			queryClient.invalidateQueries({ queryKey: listKey });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to invite member"
			);
		},
	});

	const cancelMutation = useMutation({
		mutationFn: async (invitationId: string) => {
			const { error } = await authClient.organization.cancelInvitation({
				invitationId,
			});
			if (error) {
				throw new Error(error.message);
			}
		},
		onSuccess: () => {
			toast.success("Invitation cancelled successfully");
			queryClient.invalidateQueries({ queryKey: listKey });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to cancel invitation"
			);
		},
	});

	return {
		invitations,
		isLoading: query.isLoading,
		error: query.error,
		pendingCount,
		isInviting: inviteMutation.isPending,
		isCancelling: cancelMutation.isPending,
		inviteMember: inviteMutation.mutateAsync,
		cancelInvitation: cancelMutation.mutateAsync,
		refetch: query.refetch,
	};
}
