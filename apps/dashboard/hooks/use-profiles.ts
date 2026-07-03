import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { orpc } from "@/lib/orpc";

export interface ProfileIdentity {
	displayName: string | null;
	email: string | null;
	firstSeenAt: Date;
	profileId: string;
	traits: Record<string, unknown>;
	updatedAt: Date;
}

export function useProfileIdentities(websiteId: string, profileIds: string[]) {
	const uniqueIds = useMemo(
		() => [...new Set(profileIds.filter(Boolean))].slice(0, 100),
		[profileIds]
	);

	const query = useQuery({
		...orpc.profiles.getByIds.queryOptions({
			input: { websiteId, profileIds: uniqueIds },
		}),
		enabled: Boolean(websiteId) && uniqueIds.length > 0,
		staleTime: 5 * 60 * 1000,
	});

	const identityMap = useMemo(() => {
		const map = new Map<string, ProfileIdentity>();
		for (const profile of query.data ?? []) {
			map.set(profile.profileId, profile);
		}
		return map;
	}, [query.data]);

	return { identityMap, isLoading: query.isLoading };
}

export function useProfileIdentity(websiteId: string, profileId: string) {
	return useQuery({
		...orpc.profiles.get.queryOptions({
			input: { websiteId, profileId },
		}),
		enabled: Boolean(websiteId && profileId),
		staleTime: 5 * 60 * 1000,
	});
}
