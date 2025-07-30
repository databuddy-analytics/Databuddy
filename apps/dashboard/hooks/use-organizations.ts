import { authClient } from '@databuddy/auth/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type CreateOrganizationData = {
	name: string;
	slug?: string;
	logo?: string;
	metadata?: Record<string, unknown>;
};

type UpdateOrganizationData = {
	name?: string;
	slug?: string;
	logo?: string;
	metadata?: Record<string, unknown>;
};

type InviteMemberData = {
	email: string;
	role: 'owner' | 'admin' | 'member';
	organizationId?: string;
	resend?: boolean;
};

export type UpdateMemberData = {
	memberId: string;
	role: 'owner' | 'admin' | 'member';
	organizationId?: string;
};

const QUERY_KEYS = {
	organization: (slug: string) => ['organization', slug] as const,
	organizationMembers: (orgId: string) =>
		['organizations', orgId, 'members'] as const,
	organizationInvitations: (orgId: string) =>
		['organizations', orgId, 'invitations'] as const,
	userInvitations: ['organizations', 'invitations', 'user'] as const,
} as const;

const createMutation = <TData, TVariables>(
	mutationFn: (variables: TVariables) => Promise<TData>,
	successMessage: string,
	errorMessage: string,
	onSuccessCallback?: () => void,
	options: { showToast?: boolean } = { showToast: true }
) => ({
	mutationFn,
	onSuccess: () => {
		onSuccessCallback?.();
		if (options.showToast) {
			toast.success(successMessage);
		}
	},
	onError: (error: Error) => {
		if (options.showToast) {
			toast.error(error.message || errorMessage);
		}
	},
});

export function useOrganizations() {
	const {
		data,
		error: organizationsError,
		isPending: isOrganizationsPending,
	} = authClient.useListOrganizations();
	const {
		data: activeOrganization,
		error: activeOrganizationError,
		isPending: isActiveOrganizationPending,
	} = authClient.useActiveOrganization();

	const organizations = data || [];

	const createOrganizationMutation = useMutation(
		createMutation(
			async (data: CreateOrganizationData) => {
				const { data: result, error } = await authClient.organization.create({
					name: data.name,
					slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
					logo: data.logo,
					metadata: data.metadata,
				});
				if (error) {
					throw new Error(error.message || 'Failed to create organization');
				}
				return result;
			},
			'Organization created successfully',
			'Failed to create organization'
		)
	);

	const updateOrganizationMutation = useMutation(
		createMutation(
			async ({
				organizationId,
				data,
			}: {
				organizationId?: string;
				data: UpdateOrganizationData;
			}) => {
				if (!organizationId) {
					throw new Error('Organization ID is required');
				}
				const { data: result, error } = await authClient.organization.update({
					organizationId,
					data: {
						name: data.name,
						slug: data.slug,
						logo: data.logo,
						metadata: data.metadata,
					},
				});
				if (error) {
					throw new Error(error.message || 'Failed to update organization');
				}
				return result;
			},
			'Organization updated successfully',
			'Failed to update organization'
		)
	);

	const uploadOrganizationLogoMutation = useMutation(
		createMutation(
			async ({
				organizationId,
				formData,
			}: {
				organizationId: string;
				formData: FormData;
			}) => {
				const response = await fetch(
					`${process.env.NEXT_PUBLIC_API_URL}/v1/upload/organization/${organizationId}/logo`,
					{
						method: 'POST',
						body: formData,
						credentials: 'include',
					}
				);

				if (!response.ok) {
					const errorData = await response
						.json()
						.catch(() => ({ message: 'Failed to upload logo' }));
					throw new Error(errorData.error || 'Failed to upload logo');
				}

				const { url } = await response.json();

				await authClient.organization.update({
					data: {
						logo: url,
					},
					organizationId,
				});

				return { url };
			},
			'Logo uploaded successfully',
			'Failed to upload logo'
		)
	);

	const deleteOrganizationMutation = useMutation(
		createMutation(
			async (organizationId: string) => {
				const { data: result, error } = await authClient.organization.delete({
					organizationId,
				});
				if (error) {
					throw new Error(error.message || 'Failed to delete organization');
				}
				return result;
			},
			'Organization deleted successfully',
			'Failed to delete organization'
		)
	);

	const setActiveOrganizationMutation = useMutation({
		mutationFn: async (organizationId: string | null) => {
			if (organizationId === null) {
				const { data: result, error } = await authClient.organization.setActive(
					{
						organizationId: null,
					}
				);
				if (error) {
					throw new Error(
						error.message || 'Failed to unset active organization'
					);
				}
				return result;
			}
			const { data: result, error } = await authClient.organization.setActive({
				organizationId,
			});
			if (error) {
				throw new Error(error.message || 'Failed to set active organization');
			}
			return result;
		},
		onSuccess: () => {
			toast.success('Workspace updated');
		},
		onError: (error: Error) => {
			toast.error(error.message || 'Failed to update workspace');
		},
	});

	return {
		organizations,
		activeOrganization,

		isLoading: isOrganizationsPending || isActiveOrganizationPending,

		organizationsError,
		activeOrganizationError,
		hasError: !!organizationsError || !!activeOrganizationError,

		createOrganization: createOrganizationMutation.mutate,
		updateOrganization: updateOrganizationMutation.mutate,
		deleteOrganization: deleteOrganizationMutation.mutate,
		setActiveOrganization: setActiveOrganizationMutation.mutate,
		uploadOrganizationLogo: uploadOrganizationLogoMutation.mutate,

		isCreatingOrganization: createOrganizationMutation.isPending,
		isUpdatingOrganization: updateOrganizationMutation.isPending,
		isDeletingOrganization: deleteOrganizationMutation.isPending,
		isSettingActiveOrganization: setActiveOrganizationMutation.isPending,
		isUploadingOrganizationLogo: uploadOrganizationLogoMutation.isPending,
	};
}

export function useOrganizationMembers(organizationId: string) {
	const queryClient = useQueryClient();

	const {
		data: members = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: QUERY_KEYS.organizationMembers(organizationId),
		queryFn: async () => {
			const { data, error } = await authClient.organization.getFullOrganization(
				{
					query: { organizationId },
				}
			);
			if (error) {
				throw new Error(error.message || 'Failed to fetch members');
			}
			return data?.members || [];
		},
		enabled: !!organizationId,
	});

	const invalidateMembers = () => {
		queryClient.invalidateQueries({
			queryKey: QUERY_KEYS.organizationMembers(organizationId),
		});
	};

	const inviteMemberMutation = useMutation(
		createMutation(
			async (data: InviteMemberData) => {
				const { data: result, error } =
					await authClient.organization.inviteMember({
						email: data.email,
						role: data.role,
						organizationId: data.organizationId,
						resend: data.resend,
					});
				if (error) {
					throw new Error(error.message || 'Failed to invite member');
				}
				return result;
			},
			'Member invited successfully',
			'Failed to invite member',
			() => {
				invalidateMembers();
				queryClient.invalidateQueries({
					queryKey: QUERY_KEYS.organizationInvitations(organizationId),
				});
			}
		)
	);

	const updateMemberMutation = useMutation(
		createMutation(
			async (data: UpdateMemberData) => {
				const { data: result, error } =
					await authClient.organization.updateMemberRole({
						memberId: data.memberId,
						role: data.role,
						organizationId: data.organizationId,
					});
				if (error) {
					throw new Error(error.message || 'Failed to update member role');
				}
				return result;
			},
			'Member role updated successfully',
			'Failed to update member role',
			invalidateMembers
		)
	);

	const removeMemberMutation = useMutation(
		createMutation(
			async (memberIdOrEmail: string) => {
				const { data: result, error } =
					await authClient.organization.removeMember({
						memberIdOrEmail,
						organizationId,
					});
				if (error) {
					throw new Error(error.message || 'Failed to remove member');
				}
				return result;
			},
			'Member removed successfully',
			'Failed to remove member',
			invalidateMembers
		)
	);

	return {
		members,
		isLoading,
		error,
		hasError: !!error,
		refetch,

		inviteMember: inviteMemberMutation.mutate,
		updateMember: updateMemberMutation.mutate,
		removeMember: removeMemberMutation.mutate,

		isInvitingMember: inviteMemberMutation.isPending,
		isUpdatingMember: updateMemberMutation.isPending,
		isRemovingMember: removeMemberMutation.isPending,
	};
}

export function useOrganizationInvitations(organizationId: string) {
	const queryClient = useQueryClient();

	const {
		data: invitations = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: QUERY_KEYS.organizationInvitations(organizationId),
		queryFn: async () => {
			const { data, error } = await authClient.organization.listInvitations({
				query: { organizationId },
			});
			if (error) {
				throw new Error(error.message || 'Failed to fetch invitations');
			}
			return data || [];
		},
		enabled: !!organizationId,
	});

	const cancelInvitationMutation = useMutation(
		createMutation(
			async (invitationId: string) => {
				const { data: result, error } =
					await authClient.organization.cancelInvitation({
						invitationId,
					});
				if (error) {
					throw new Error(error.message || 'Failed to cancel invitation');
				}
				return result;
			},
			'Invitation cancelled successfully',
			'Failed to cancel invitation',
			() =>
				queryClient.invalidateQueries({
					queryKey: QUERY_KEYS.organizationInvitations(organizationId),
				})
		)
	);

	return {
		invitations,
		isLoading,
		error,
		hasError: !!error,
		refetch,

		cancelInvitation: cancelInvitationMutation.mutate,

		isCancellingInvitation: cancelInvitationMutation.isPending,
	};
}

export function useUserInvitations() {
	const queryClient = useQueryClient();

	const {
		data: invitations = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: QUERY_KEYS.userInvitations,
		queryFn: async () => {
			const { data, error } = await authClient.organization.listInvitations();
			if (error) {
				throw new Error(error.message || 'Failed to fetch user invitations');
			}
			return data || [];
		},
	});

	const invalidateUserInvitations = () => {
		queryClient.invalidateQueries({ queryKey: QUERY_KEYS.userInvitations });
	};

	const acceptInvitationMutation = useMutation(
		createMutation(
			async (invitationId: string) => {
				const { data: result, error } =
					await authClient.organization.acceptInvitation({
						invitationId,
					});
				if (error) {
					throw new Error(error.message || 'Failed to accept invitation');
				}
				return result;
			},
			'Invitation accepted successfully',
			'Failed to accept invitation',
			invalidateUserInvitations
		)
	);

	const rejectInvitationMutation = useMutation(
		createMutation(
			async (invitationId: string) => {
				const { data: result, error } =
					await authClient.organization.rejectInvitation({
						invitationId,
					});
				if (error) {
					throw new Error(error.message || 'Failed to reject invitation');
				}
				return result;
			},
			'Invitation rejected',
			'Failed to reject invitation',
			invalidateUserInvitations
		)
	);

	return {
		invitations,
		isLoading,
		error,
		hasError: !!error,
		refetch,

		acceptInvitation: acceptInvitationMutation.mutate,
		rejectInvitation: rejectInvitationMutation.mutate,

		isAcceptingInvitation: acceptInvitationMutation.isPending,
		isRejectingInvitation: rejectInvitationMutation.isPending,
	};
}

export type Organization = ReturnType<
	typeof useOrganizations
>['organizations'][number];

export type ActiveOrganization = ReturnType<
	typeof useOrganizations
>['activeOrganization'];

export type OrganizationsError = ReturnType<
	typeof useOrganizations
>['organizationsError'];

export type OrganizationMember = ReturnType<
	typeof useOrganizationMembers
>['members'][number];

export type Invitation = ReturnType<
	typeof useOrganizationInvitations
>['invitations'][number];

export type CancelInvitation = ReturnType<
	typeof useOrganizationInvitations
>['cancelInvitation'];
