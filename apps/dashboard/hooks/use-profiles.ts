import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function useProfileIdentity(websiteId: string, profileId: string) {
	return useQuery({
		...orpc.profiles.get.queryOptions({
			input: { websiteId, profileId },
		}),
		enabled: Boolean(websiteId && profileId),
		staleTime: 5 * 60 * 1000,
	});
}
