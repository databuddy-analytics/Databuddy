'use client';

import type { AppRouter } from '@databuddy/rpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { trpc } from '@/lib/trpc';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

export type Integration =
	RouterOutput['integrations']['getIntegrations']['integrations'][number];
export type IntegrationStats = RouterOutput['integrations']['getStats'];
export type DisconnectIntegrationData =
	RouterInput['integrations']['disconnect'];

export function useIntegrations() {
	const { data, isLoading, isError, refetch, isFetching } =
		trpc.integrations.getIntegrations.useQuery();

	return {
		integrations: data?.integrations || [],
		totalConnected: data?.totalConnected || 0,
		isLoading,
		isFetching,
		isError,
		refetch,
	};
}

export function useIntegration(provider: 'vercel') {
	return trpc.integrations.getIntegration.useQuery(
		{ provider },
		{ enabled: !!provider }
	);
}

export function useDisconnectIntegration() {
	const utils = trpc.useUtils();
	return trpc.integrations.disconnect.useMutation({
		onSuccess: () => {
			// Invalidate integrations queries to refetch data
			utils.integrations.getIntegrations.invalidate();
			utils.integrations.getStats.invalidate();
		},
		onError: (error) => {
			console.error('Failed to disconnect integration:', error);
		},
	});
}

export function useIntegrationStats() {
	return trpc.integrations.getStats.useQuery();
}
