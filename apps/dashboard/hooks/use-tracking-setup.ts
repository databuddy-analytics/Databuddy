import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function useTrackingSetup(websiteId: string) {
	const {
		data: trackingSetupData,
		isLoading: isTrackingSetupLoading,
		isError: isTrackingSetupError,
		error: trackingSetupError,
		refetch: refetchTrackingSetup,
	} = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({ input: { websiteId } }),
		enabled: !!websiteId,
	});

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
