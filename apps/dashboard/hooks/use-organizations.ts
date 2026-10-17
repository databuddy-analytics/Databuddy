import { authClient } from "@databuddy/auth/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { toast } from "sonner";
import { showErrorToast } from "@/lib/user-facing-error";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	ORGANIZATIONS_QUERY_KEY,
	resetActiveOrganizationQueries,
} from "@/lib/active-organization-queries";
import { orpc } from "@/lib/orpc";
import { pendingActiveOrganizationIdAtom } from "@/stores/jotai/organizationsAtoms";

export type OrganizationRole = "owner" | "admin" | "member";

interface CreateOrganizationData {
	logo?: string;
	name: string;
	slug?: string;
}

interface UpdateOrganizationData {
	logo?: string;
	name?: string;
	slug?: string;
}

export interface UpdateMemberData {
	memberId: string;
	organizationId?: string;
	role: OrganizationRole;
}

const organizationMembersKey = (orgId: string) =>
	["organizations", orgId, "members"] as const;

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
	onError: (error: unknown) => showErrorToast(error, errorMessage),
	meta: { suppressGlobalErrorToast: true },
});

export function useOrganizations() {
	const {
		organizations,
		activeOrganization,
		isLoading,
		isSwitchingOrganization,
	} = useOrganizationsContext();
	const queryClient = useQueryClient();
	const setPendingActiveOrganizationId = useSetAtom(
		pendingActiveOrganizationIdAtom
	);

	const invalidateOrganizationList = () => {
		queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_QUERY_KEY });
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
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to create organization");
				}
				return result;
			},
			"Organization created",
			"Failed to create organization"
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
						},
					});
				if (apiError) {
					throw new Error(apiError.message || "Failed to update organization");
				}
				return result;
			},
			"Organization updated",
			"Failed to update organization",
			invalidateOrganizationList
		)
	);

	const updateAvatarSeedMutation = useMutation({
		...orpc.organizations.updateAvatarSeed.mutationOptions(),
		onSuccess: () => {
			invalidateOrganizationList();
			toast.success("Avatar updated");
		},
		meta: { suppressGlobalErrorToast: true },
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
			"Organization deleted",
			"Failed to delete organization"
		)
	);

	const setActiveOrganizationMutation = useMutation({
		onMutate: (organizationId: string | null) => {
			setPendingActiveOrganizationId(organizationId);
		},
		mutationFn: async (organizationId: string | null) => {
			const { data: result, error: apiError } =
				await authClient.organization.setActive({ organizationId });
			if (apiError) {
				throw new Error(apiError.message || "Failed to switch organization");
			}
			return result;
		},
		onSuccess: async () => {
			await resetActiveOrganizationQueries(queryClient);
			toast.success("Organization updated");
		},
		onError: (error) => {
			setPendingActiveOrganizationId(null);
			showErrorToast(error, "Failed to switch organization");
		},
		meta: { suppressGlobalErrorToast: true },
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
			"Left organization",
			"Failed to leave organization"
		)
	);

	return {
		organizations,
		activeOrganization,
		isLoading,
		isSwitchingOrganization,

		createOrganization: createOrganizationMutation.mutate,
		updateOrganization: updateOrganizationMutation.mutate,
		deleteOrganization: deleteOrganizationMutation.mutate,
		setActiveOrganization: setActiveOrganizationMutation.mutate,
		leaveOrganization: leaveOrganizationMutation.mutate,
		updateAvatarSeed: updateAvatarSeedMutation.mutate,

		isCreatingOrganization: createOrganizationMutation.isPending,
		isUpdatingOrganization: updateOrganizationMutation.isPending,
		isDeletingOrganization: deleteOrganizationMutation.isPending,
		isSettingActiveOrganization: setActiveOrganizationMutation.isPending,
		isLeavingOrganization: leaveOrganizationMutation.isPending,
		isUpdatingAvatarSeed: updateAvatarSeedMutation.isPending,
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
		queryKey: organizationMembersKey(organizationId),
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
			queryKey: organizationMembersKey(organizationId),
		});
	};

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
			"Member role updated",
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
			"Member removed",
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

		updateMember: updateMemberMutation.mutate,
		removeMember: removeMemberMutation.mutate,

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
