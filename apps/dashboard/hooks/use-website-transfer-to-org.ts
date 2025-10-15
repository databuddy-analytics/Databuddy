'use client';

import { trpc } from '@/lib/trpc';

export function useWebsiteTransferToOrg() {
	const utils = trpc.useUtils();

	const transferMutation = trpc.websites.transferToOrganization.useMutation({
		onSuccess: (_, variables) => {
			utils.websites.list.invalidate();
			utils.websites.listWithCharts.invalidate();
			utils.websites.getById.invalidate({ id: variables.websiteId });
			
			utils.websites.getById.refetch({ id: variables.websiteId });
		},
	});

	return {
		isTransferring: transferMutation.isPending,
		transferWebsiteToOrg: (
			args: { websiteId: string; targetOrganizationId: string },
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
