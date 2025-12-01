"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function useWebsiteTransfer(organizationId?: string) {
	const queryClient = useQueryClient();

	const { data: personalWebsites, isLoading: isLoadingPersonal } = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId: undefined },
		}),
	});

	const { data: organizationWebsites, isLoading: isLoadingOrg } = useQuery({
		...orpc.websites.list.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	const transferMutation = useMutation({
		...orpc.websites.transfer.mutationOptions(),
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({
				queryKey: orpc.websites.list.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.websites.listWithCharts.key(),
			});
			queryClient.invalidateQueries({
				queryKey: orpc.websites.getById.key({
					input: { id: variables.websiteId },
				}),
			});
		},
	});

	return {
		personalWebsites: personalWebsites ?? [],
		organizationWebsites: organizationWebsites ?? [],
		isLoading: isLoadingPersonal || isLoadingOrg,
		isTransferring: transferMutation.isPending,
		transferWebsite: (
			args: { websiteId: string; organizationId?: string },
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
