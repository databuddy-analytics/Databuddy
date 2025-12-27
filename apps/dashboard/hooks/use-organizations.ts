import { authClient } from "@databuddy/auth/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	AUTH_QUERY_KEYS,
	useOrganizationsContext,
} from "@/components/providers/organizations-provider";
import { orpc } from "@/lib/orpc";

export type OrganizationRole = "owner" | "admin" | "member";

interface CreateOrganizationData {
	name: string;
	slug?: string;
	logo?: string;
	metadata?: Record<string, unknown>;
}

interface UpdateOrganizationData {
	name?: string;
	slug?: string;
	logo?: string;
	metadata?: Record<string, unknown>;
}

interface InviteMemberData {
	email: string;
	role: OrganizationRole;
	organizationId?: string;
	resend?: boolean;
}

export interface UpdateMemberData {
	memberId: string;
	role: OrganizationRole;
	organizationId?: string;
}

const QUERY_KEYS = {
	organizationMembers: (orgId: string) =>
		["organizations", orgId, "members"] as const,
	organizationInvitations: (orgId: string) =>
		["organizations", orgId, "invitations"] as const,
	userInvitations: ["organizations", "invitations", "user"] as const,
} as const;

const createMutation = <TData, TVariables>(
	mutationFn: (variables: TVariables) => Promise<TData>,
	successMessage: string,
	_errorMessage: string,
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
});

export function useOrganizations() {
	const { organizations, activeOrganization, isLoading } =
		useOrganizationsContext();
	const queryClient = useQueryClient();

	const invalidateOrganizationQueries = () => {
		queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.organizations });
		queryClient.invalidateQueries({
			queryKey: AUTH_QUERY_KEYS.activeOrganization,
		});
		queryClient.invalidateQueries({
			queryKey: orpc.websites.listWithCharts.key(),
		});
		queryClient.invalidateQueries({ queryKey: orpc.websites.list.key() });
		queryClient.invalidateQueries({ queryKey: orpc.websites.getById.key() });
	};

	const createOrganizationMutation = useMutation(
		createMutation(
			async (orgInput: CreateOrganizationData) => {
				const { data: result, error: apiError } =
					await authClient.organization.create({
						name: orgInput.name,
						slug:
							orgInput.slug || orgInput.name.toLowerCase().replace(/\s+/g, "-"),
						logo: orgInput.logo,
						metadata: orgInput.metadata,
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to create organization");
				}
				return result;
			},
			"Organization created successfully",
			"Failed to create organization",
			invalidateOrganizationQueries
		)
	);

	const updateOrganizationMutation = useMutation(
		createMutation(
			async ({
				organizationId,
				data: updateData,
			}: {
				organizationId?: string;
				data: UpdateOrganizationData;
			}) => {
				if (!organizationId) {
					throw new Error("Organization ID is required");
				}
				const { data: result, error: apiError } =
					await authClient.organization.update({
						organizationId,
						data: {
							name: updateData.name,
							slug: updateData.slug,
							logo: updateData.logo,
							metadata: updateData.metadata,
						},
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to update organization");
				}
				return result;
			},
			"Organization updated successfully",
			"Failed to update organization",
			invalidateOrganizationQueries
		)
	);

	const uploadOrganizationLogoMutation = useMutation({
		...orpc.organizations.uploadLogo.mutationOptions(),
		onSuccess: () => {
			invalidateOrganizationQueries();
			toast.success("Logo uploaded successfully");
		},
	});

	const deleteOrganizationLogoMutation = useMutation({
		...orpc.organizations.deleteLogo.mutationOptions(),
		onSuccess: () => {
			invalidateOrganizationQueries();
			toast.success("Logo deleted successfully");
		},
	});

	const deleteOrganizationMutation = useMutation(
		createMutation(
			async (organizationId: string) => {
				const { data: result, error: apiError } =
					await authClient.organization.delete({
						organizationId,
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to delete organization");
				}
				return result;
			},
			"Organization deleted successfully",
			"Failed to delete organization",
			invalidateOrganizationQueries
		)
	);

	const setActiveOrganizationMutation = useMutation({
		mutationFn: async (organizationId: string | null) => {
			if (organizationId === null) {
				const { data: setActiveData, error: apiError } =
					await authClient.organization.setActive({
						organizationId: null,
					});
				if (apiError) {
					throw new Error(
						apiError.message || "Failed to unset active organization"
					);
				}
				return setActiveData;
			}
			const { data: setActiveData2, error: apiError2 } =
				await authClient.organization.setActive({
					organizationId,
				});
			if (apiError2) {
				throw new Error(
					apiError2.message || "Failed to set active organization"
				);
			}
			return setActiveData2;
		},
		onSuccess: () => {
			invalidateOrganizationQueries();
			toast.success("Workspace updated");
		},
	});

	const leaveOrganizationMutation = useMutation(
		createMutation(
			async (organizationId: string) => {
				const { data: result, error: apiError } =
					await authClient.organization.leave({
						organizationId,
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to leave organization");
				}
				return result;
			},
			"Left organization successfully",
			"Failed to leave organization",
			invalidateOrganizationQueries
		)
	);

	return {
		organizations,
		activeOrganization,
		isLoading,

		createOrganization: createOrganizationMutation.mutate,
		updateOrganization: updateOrganizationMutation.mutate,
		deleteOrganization: deleteOrganizationMutation.mutate,
		setActiveOrganization: setActiveOrganizationMutation.mutate,
		leaveOrganization: leaveOrganizationMutation.mutate,
		uploadOrganizationLogo: uploadOrganizationLogoMutation.mutate,
		deleteOrganizationLogo: deleteOrganizationLogoMutation.mutate,

		isCreatingOrganization: createOrganizationMutation.isPending,
		isUpdatingOrganization: updateOrganizationMutation.isPending,
		isDeletingOrganization: deleteOrganizationMutation.isPending,
		isSettingActiveOrganization: setActiveOrganizationMutation.isPending,
		isLeavingOrganization: leaveOrganizationMutation.isPending,
		isUploadingOrganizationLogo: uploadOrganizationLogoMutation.isPending,
		isDeletingOrganizationLogo: deleteOrganizationLogoMutation.isPending,
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
			const { data: fullOrgData, error: apiError } =
				await authClient.organization.getFullOrganization({
					query: { organizationId },
				});
			if (apiError) {
				throw new Error(apiError.message || "Failed to fetch members");
			}
			return fullOrgData?.members || [];
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
				const { data: result, error: apiError } =
					await authClient.organization.inviteMember({
						email: data.email,
						role: data.role,
						organizationId: data.organizationId,
						resend: data.resend,
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to invite member");
				}
				return result;
			},
			"Member invited successfully",
			"Failed to invite member",
			invalidateMembers
		)
	);

	const updateMemberMutation = useMutation(
		createMutation(
			async (data: UpdateMemberData) => {
				const { data: result, error: apiError } =
					await authClient.organization.updateMemberRole({
						memberId: data.memberId,
						role: data.role,
						organizationId: data.organizationId,
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to update member role");
				}
				return result;
			},
			"Member role updated successfully",
			"Failed to update member role",
			invalidateMembers
		)
	);

	const removeMemberMutation = useMutation(
		createMutation(
			async (memberIdOrEmail: string) => {
				const { data: result, error: apiError } =
					await authClient.organization.removeMember({
						memberIdOrEmail,
						organizationId,
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to remove member");
				}
				return result;
			},
			"Member removed successfully",
			"Failed to remove member",
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
export type Organization = ReturnType<
	typeof useOrganizations
>["organizations"][number];

export type ActiveOrganization = ReturnType<
	typeof useOrganizations
>["activeOrganization"];

export type OrganizationMember = ReturnType<
	typeof useOrganizationMembers
>["members"][number];

export type CancelInvitation = (invitationId: string) => Promise<void>;
