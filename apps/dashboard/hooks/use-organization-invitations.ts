import { authClient } from "@databuddy/auth/client";
import type { invitation } from "@databuddy/db/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import type { OrganizationRole } from "@/hooks/use-organizations";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";
import { dayjs } from "@databuddy/ui";
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
		onSuccess: (_data, input) => {
			toast.success(`Invitation sent to ${input.email}`);
			queryClient.invalidateQueries({ queryKey: listKey });
		},
		onError: (error) => {
			toast.error(
				getUserFacingErrorMessage(error, "We couldn't send the invitation.")
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
			toast.success("Invitation canceled");
			queryClient.invalidateQueries({ queryKey: listKey });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to cancel invitation"
			);
		},
	});

	const clearExpiredMutation = useMutation({
		mutationFn: async () =>
			orpc.organizations.clearExpiredInvitations.call({
				organizationId,
			}),
		onSuccess: (data) => {
			toast.success(
				`Cleared ${data.deleted} invitation${data.deleted === 1 ? "" : "s"}`
			);
			queryClient.invalidateQueries({ queryKey: listKey });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to clear expired invitations"
			);
		},
	});

	const resendMutation = useMutation({
		mutationFn: async (input: { email: string; role: string }) => {
			const { error } = await authClient.organization.inviteMember({
				email: input.email,
				role: input.role as OrganizationRole,
				organizationId,
				resend: true,
			});
			if (error) {
				throw new Error(error.message);
			}
		},
		onSuccess: (_data, input) => {
			toast.success(`Invitation resent to ${input.email}`);
			queryClient.invalidateQueries({ queryKey: listKey });
		},
		onError: (error) => {
			toast.error(
				getUserFacingErrorMessage(error, "We couldn't resend the invitation.")
			);
		},
	});

	const expiredCount = useMemo(
		() =>
			invitations.filter(
				(inv) =>
					inv.status === "accepted" ||
					inv.status === "canceled" ||
					inv.status === "rejected" ||
					(inv.status === "pending" && dayjs(inv.expiresAt).isBefore(dayjs()))
			).length,
		[invitations]
	);

	return {
		invitations,
		isLoading: query.isLoading,
		error: query.error,
		pendingCount,
		expiredCount,
		isInviting: inviteMutation.isPending,
		isCancelling: cancelMutation.isPending,
		isClearingExpired: clearExpiredMutation.isPending,
		isResending: resendMutation.isPending,
		inviteMember: inviteMutation.mutateAsync,
		cancelInvitation: cancelMutation.mutateAsync,
		clearExpiredInvitations: clearExpiredMutation.mutateAsync,
		resendInvitation: resendMutation.mutateAsync,
		refetch: query.refetch,
	};
}
