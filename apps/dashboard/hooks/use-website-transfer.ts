'use client';

import { trpc } from '@/lib/trpc';

export function useWebsiteTransfer(organizationId?: string) {
	// Fetch personal websites (no organizationId)
	const { data: personalWebsites, isLoading: isLoadingPersonal } =
		trpc.websites.list.useQuery({
			organizationId: undefined,
		});

	// Fetch organization websites (only if organizationId is provided)
	const { data: organizationWebsites, isLoading: isLoadingOrg } =
		trpc.websites.list.useQuery(
			{
				organizationId,
			},
			{
				enabled: !!organizationId,
			}
		);

	const utils = trpc.useUtils();

	const transferMutation = trpc.websites.transfer.useMutation({
		onSuccess: (_, variables) => {
			utils.websites.list.invalidate();
			utils.websites.listWithCharts.invalidate();
			utils.websites.getById.invalidate({ id: variables.websiteId });
		},
	});

	return {
		personalWebsites: personalWebsites || [],
		organizationWebsites: organizationWebsites || [],
		isLoading: isLoadingPersonal || isLoadingOrg,
		isTransferring: transferMutation.isPending,
		transferWebsite: (
			args: { websiteId: string; organizationId?: string },
			opts?: { onSuccess?: () => void; onError?: (error: any) => void }
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
