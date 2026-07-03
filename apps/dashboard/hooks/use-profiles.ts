import { useQueries, useQuery } from "@tanstack/react-query";
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

const BATCH_SIZE = 100;

export function useProfileIdentities(websiteId: string, profileIds: string[]) {
	const batches = useMemo(() => {
		const uniqueIds = [...new Set(profileIds.filter(Boolean))];
		const chunks: string[][] = [];
		for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
			chunks.push(uniqueIds.slice(i, i + BATCH_SIZE));
		}
		return chunks;
	}, [profileIds]);

	return useQueries({
		queries: batches.map((batch) => ({
			...orpc.profiles.getByIds.queryOptions({
				input: { websiteId, profileIds: batch },
			}),
			enabled: Boolean(websiteId) && batch.length > 0,
			staleTime: 5 * 60 * 1000,
		})),
		combine: (results) => {
			const identityMap = new Map<string, ProfileIdentity>();
			for (const result of results) {
				for (const profile of result.data ?? []) {
					identityMap.set(profile.profileId, profile);
				}
			}
			return {
				identityMap,
				isLoading: results.some((result) => result.isLoading),
			};
		},
	});
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
