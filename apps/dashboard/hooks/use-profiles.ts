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

export function useProfileHistory(websiteId: string, profileId: string) {
	return useQuery({
		...orpc.profiles.getHistory.queryOptions({
			input: { websiteId, profileId },
		}),
		enabled: Boolean(websiteId && profileId),
		staleTime: 5 * 60 * 1000,
	});
}

export function useTraitKeys(websiteId: string) {
	return useQuery({
		...orpc.profiles.traitKeys.queryOptions({ input: { websiteId } }),
		enabled: Boolean(websiteId),
		staleTime: 5 * 60 * 1000,
	});
}

export function useTraitValues(websiteId: string, key: string | null) {
	return useQuery({
		...orpc.profiles.traitValues.queryOptions({
			input: { websiteId, key: key ?? "" },
		}),
		enabled: Boolean(websiteId && key),
		staleTime: 5 * 60 * 1000,
	});
}
