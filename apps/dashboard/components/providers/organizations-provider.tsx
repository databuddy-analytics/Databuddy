"use client";

import { authClient, useSession } from "@databuddy/auth/client";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useEffect, useMemo } from "react";
import {
	activeOrganizationAtom,
	getOrganizationBySlugAtom,
	isLoadingOrganizationsAtom,
	organizationsAtom,
	pendingActiveOrganizationIdAtom,
} from "@/stores/jotai/organizationsAtoms";
export type { Organization } from "@/stores/jotai/organization-types";

export const AUTH_QUERY_KEYS = {
	organizations: ["auth", "organizations"] as const,
	activeOrganization: ["auth", "activeOrganization"] as const,
} as const;

export function OrganizationsProvider({ children }: { children: ReactNode }) {
	const setOrganizations = useSetAtom(organizationsAtom);
	const setActiveOrganization = useSetAtom(activeOrganizationAtom);
	const [pendingActiveOrganizationId, setPendingActiveOrganizationId] = useAtom(
		pendingActiveOrganizationIdAtom
	);
	const setIsLoading = useSetAtom(isLoadingOrganizationsAtom);

	const { data: session, isPending: isLoadingSession } = useSession();

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
		if (activeOrganization?.id === pendingActiveOrganizationId) {
			setPendingActiveOrganizationId(null);
		}
	}, [
		activeOrganization,
		pendingActiveOrganizationId,
		setActiveOrganization,
		setPendingActiveOrganizationId,
	]);

	useEffect(() => {
		setIsLoading(isLoadingSession || isLoadingOrgs);
	}, [isLoadingSession, isLoadingOrgs, setIsLoading]);

	return <>{children}</>;
}

export function useOrganizationsContext() {
	const organizations = useAtomValue(organizationsAtom);
	const activeOrganization = useAtomValue(activeOrganizationAtom);
	const pendingActiveOrganizationId = useAtomValue(
		pendingActiveOrganizationIdAtom
	);
	const isLoading = useAtomValue(isLoadingOrganizationsAtom);
	const [getOrganizationBySlug] = useAtom(getOrganizationBySlugAtom);

	const { data: sessionData } = useSession();

	const activeOrganizationId =
		(
			sessionData?.session as
				| { activeOrganizationId?: string | null }
				| undefined
		)?.activeOrganizationId ?? null;

	return {
		organizations,
		activeOrganization,
		activeOrganizationId,
		isLoading,
		isSwitchingOrganization: pendingActiveOrganizationId !== null,
		getOrganization: getOrganizationBySlug,
	};
}
