"use client";

import { authClient } from "@databuddy/auth/client";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useEffect } from "react";
import {
	activeOrganizationAtom,
	getOrganizationBySlugAtom,
	isLoadingOrganizationsAtom,
	organizationsAtom,
} from "@/stores/jotai/organizationsAtoms";

export type Organization = NonNullable<
  ReturnType<typeof authClient.useListOrganizations>["data"]
>[number];

export const AUTH_QUERY_KEYS = {
	session: ["auth", "session"] as const,
	organizations: ["auth", "organizations"] as const,
	activeOrganization: ["auth", "activeOrganization"] as const,
} as const;

export function OrganizationsProvider({ children }: { children: ReactNode }) {
	const setOrganizations = useSetAtom(organizationsAtom);
	const setActiveOrganization = useSetAtom(activeOrganizationAtom);
	const setIsLoading = useSetAtom(isLoadingOrganizationsAtom);

	// Fetch organizations with TanStack Query (cached & deduplicated)
	const { data: organizationsData, isPending: isLoadingOrgs } = useQuery({
		queryKey: AUTH_QUERY_KEYS.organizations,
		queryFn: async () => {
			const result = await authClient.organization.list();
			return result.data ?? [];
		},
		staleTime: 2 * 60 * 1000, // 2 minutes
		gcTime: 5 * 60 * 1000, // 5 minutes
	});

	// Fetch active organization with TanStack Query (cached & deduplicated)
	const { data: activeOrganization, isPending: isLoadingActive } = useQuery({
		queryKey: AUTH_QUERY_KEYS.activeOrganization,
		queryFn: async () => {
			// getFullOrganization returns the currently active org when no ID specified
			const result = await authClient.organization.getFullOrganization();
			return result.data ?? null;
		},
		staleTime: 2 * 60 * 1000,
		gcTime: 5 * 60 * 1000,
	});

	// Sync to atoms in useEffect to avoid setState during render
	useEffect(() => {
		if (organizationsData) {
			setOrganizations(organizationsData);
		}
	}, [organizationsData, setOrganizations]);

	useEffect(() => {
		setActiveOrganization(activeOrganization ?? null);
	}, [activeOrganization, setActiveOrganization]);

	useEffect(() => {
		setIsLoading(isLoadingOrgs || isLoadingActive);
	}, [isLoadingOrgs, isLoadingActive, setIsLoading]);

	return <>{children}</>;
}

/**
 * @deprecated Use useOrganizations from @/hooks/use-organizations instead
 * This is kept for backwards compatibility
 */
export function useOrganizationsContext() {
	const organizations = useAtomValue(organizationsAtom);
	const activeOrganization = useAtomValue(activeOrganizationAtom);
	const isLoading = useAtomValue(isLoadingOrganizationsAtom);
	const [getOrganizationBySlug] = useAtom(getOrganizationBySlugAtom);

  return {
    organizations,
    activeOrganization,
    isLoading,
    getOrganization: (orgSlug: string) =>
      organizations.find((org) => org.slug === orgSlug),
  };
}
