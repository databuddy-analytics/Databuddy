"use client";

import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

export function useUserInvitations(enabled = true) {
	const { data, isLoading, error, refetch } = useQuery({
		...orpc.organizations.getUserPendingInvitations.queryOptions({
			input: undefined,
		}),
		enabled,
		staleTime: 60 * 1000,
		refetchInterval: 5 * 60 * 1000,
	});

	return {
		invitations: data ?? [],
		count: data?.length ?? 0,
		isLoading,
		error,
		refetch,
	};
}
