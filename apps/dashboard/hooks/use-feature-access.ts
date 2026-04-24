"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function useFeatureAccess(flagKey: string) {
	const { data, isLoading } = useQuery({
		...orpc.featureInvite.checkAccess.queryOptions({
			input: { flagKey },
		}),
	});

	return {
		hasAccess: data?.hasAccess ?? false,
		isLoading,
	};
}
