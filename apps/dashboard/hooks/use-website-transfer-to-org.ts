"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function useWebsiteTransferToOrg() {
	const queryClient = useQueryClient();

	const transferMutation = useMutation({
		...orpc.websites.transferToOrganization.mutationOptions(),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: orpc.websites.list.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.websites.listWithCharts.key(),
			});
			const getByIdKey = orpc.websites.getById.key({
				input: { id: variables.websiteId },
			});
			queryClient.invalidateQueries({ queryKey: getByIdKey });
			queryClient.refetchQueries({ queryKey: getByIdKey });
		},
	});

	return {
		isTransferring: transferMutation.isPending,
		transferWebsiteToOrg: (
			args: { websiteId: string; targetOrganizationId: string },
			opts?: { onSuccess?: () => void; onError?: (error: unknown) => void }
		) => {
			transferMutation.mutate(args, {
				onSuccess: () => {
					opts?.onSuccess?.();
				},
				onError: (error) => {
					opts?.onError?.(error);
				},
			});
		},
	};
}
