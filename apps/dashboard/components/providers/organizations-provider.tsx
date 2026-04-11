"use client";

import { authClient, useSession } from "@databuddy/auth/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
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
	organizations: ["auth", "organizations"] as const,
	activeOrganization: ["auth", "activeOrganization"] as const,
} as const;

export function OrganizationsProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const setOrganizations = useSetAtom(organizationsAtom);
	const setActiveOrganization = useSetAtom(activeOrganizationAtom);
	const setIsLoading = useSetAtom(isLoadingOrganizationsAtom);
	const hasSyncedInitialOrganization = useRef(false);

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
			return organizationsData?.[0] ?? null;
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

	useEffect(() => {
		const activeId = (
			session?.session as { activeOrganizationId?: string | null } | undefined
		)?.activeOrganizationId;
		const fallbackOrganizationId = organizationsData?.[0]?.id;

		if (isLoadingSession || isLoadingOrgs) {
			return;
		}

		if (
			activeId ||
			!fallbackOrganizationId ||
			hasSyncedInitialOrganization.current
		) {
			return;
		}

		hasSyncedInitialOrganization.current = true;

		authClient.organization
			.setActive({
				organizationId: fallbackOrganizationId,
			})
			.then(() => {
				queryClient.invalidateQueries({
					queryKey: AUTH_QUERY_KEYS.activeOrganization,
				});
				queryClient.invalidateQueries({
					queryKey: AUTH_QUERY_KEYS.organizations,
				});
			})
			.catch(() => {
				hasSyncedInitialOrganization.current = false;
			});
	}, [
		isLoadingOrgs,
		isLoadingSession,
		organizationsData,
		queryClient,
		session,
	]);

	return <>{children}</>;
}

export function useOrganizationsContext() {
	const organizations = useAtomValue(organizationsAtom);
	const activeOrganization = useAtomValue(activeOrganizationAtom);
	const isLoading = useAtomValue(isLoadingOrganizationsAtom);
	const [getOrganizationBySlug] = useAtom(getOrganizationBySlugAtom);

	const { data: sessionData } = useSession();

	const activeOrganizationId =
		activeOrganization?.id ??
		(
			sessionData?.session as
				| { activeOrganizationId?: string | null }
				| undefined
		)?.activeOrganizationId ??
		null;

	return {
		organizations,
		activeOrganization,
		activeOrganizationId,
		organizationId: activeOrganizationId ?? undefined,
		isLoading,
		getOrganization: getOrganizationBySlug,
	};
}
