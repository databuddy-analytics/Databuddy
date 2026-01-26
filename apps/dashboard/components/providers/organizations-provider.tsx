"use client";

import { authClient } from "@databuddy/auth/client";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useEffect, useMemo } from "react";
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

	const { data: session, isPending: isLoadingSession } = useQuery({
		queryKey: AUTH_QUERY_KEYS.session,
		queryFn: async () => {
			const result = await authClient.getSession();
			return result.data;
		},
		staleTime: 2 * 60 * 1000,
		gcTime: 5 * 60 * 1000,
	});

	const { data: organizationsData, isPending: isLoadingOrgs } = useQuery({
		queryKey: AUTH_QUERY_KEYS.organizations,
		queryFn: async () => {
			const result = await authClient.organization.list();
			return result.data ?? [];
		},
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});

	const activeOrganization = useMemo(() => {
		const activeId = (
			session?.session as { activeOrganizationId?: string | null } | undefined
		)?.activeOrganizationId;
		if (!activeId) {
			return null;
		}
		return organizationsData?.find((org) => org.id === activeId) ?? null;
	}, [session, organizationsData]);

	useEffect(() => {
		if (organizationsData) {
			setOrganizations(organizationsData);
		}
	}, [organizationsData, setOrganizations]);

	useEffect(() => {
		setActiveOrganization(activeOrganization);
	}, [activeOrganization, setActiveOrganization]);

	useEffect(() => {
		setIsLoading(isLoadingSession || isLoadingOrgs);
	}, [isLoadingSession, isLoadingOrgs, setIsLoading]);

	return <>{children}</>;
}

export function useOrganizationsContext() {
	const organizations = useAtomValue(organizationsAtom);
	const activeOrganization = useAtomValue(activeOrganizationAtom);
	const isLoading = useAtomValue(isLoadingOrganizationsAtom);
	const [getOrganizationBySlug] = useAtom(getOrganizationBySlugAtom);

	return {
		organizations,
		activeOrganization,
		isLoading,
		getOrganization: getOrganizationBySlug,
	};
}
