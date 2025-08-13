import { trpc } from '@/lib/trpc';

export function useTrackingSetup(websiteId: string) {
	const {
		data: trackingSetupData,
		isLoading: isTrackingSetupLoading,
		isError: isTrackingSetupError,
		error: trackingSetupError,
		refetch: refetchTrackingSetup,
	} = trpc.websites.isTrackingSetup.useQuery(
		{ websiteId },
		{ enabled: !!websiteId }
	);

	const isTrackingSetup = isTrackingSetupLoading
		? null
		: (trackingSetupData?.tracking_setup ?? false);

	return {
		isTrackingSetup,
		isTrackingSetupLoading,
		isTrackingSetupError,
		trackingSetupError,
		refetchTrackingSetup,
	};
}
