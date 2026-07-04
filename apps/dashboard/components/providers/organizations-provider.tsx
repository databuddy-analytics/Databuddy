"use client";

import { authClient, useSession } from "@databuddy/auth/client";
import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { pendingActiveOrganizationIdAtom } from "@/stores/jotai/organizationsAtoms";
export type { Organization } from "@/stores/jotai/organization-types";

export const AUTH_QUERY_KEYS = {
	organizations: ["auth", "organizations"] as const,
	activeOrganization: ["auth", "activeOrganization"] as const,
} as const;

type SessionData = ReturnType<typeof useSession>["data"];

function readActiveOrganizationId(session: SessionData): string | null {
	const sessionRecord = session?.session as
		| { activeOrganizationId?: string | null }
		| undefined;
	return sessionRecord?.activeOrganizationId ?? null;
}

function useOrganizationsQuery() {
	const { data: session, isPending: isLoadingSession } = useSession();
	const isAuthenticated = Boolean(session?.user);

	const { data, isPending: isLoadingOrgs } = useQuery({
		queryKey: AUTH_QUERY_KEYS.organizations,
		queryFn: async () => {
			const result = await authClient.organization.list();
			return result.data ?? [];
		},
		enabled: !isLoadingSession && isAuthenticated,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});

	const organizations = useMemo(() => data ?? [], [data]);

	return {
		organizations,
		activeOrganizationId: readActiveOrganizationId(session),
		isLoading: isLoadingSession || (isAuthenticated && isLoadingOrgs),
	};
}

export function OrganizationsProvider({ children }: { children: ReactNode }) {
	const { activeOrganizationId } = useOrganizationsQuery();
	const [pendingActiveOrganizationId, setPendingActiveOrganizationId] = useAtom(
		pendingActiveOrganizationIdAtom
	);

	useEffect(() => {
		if (
			pendingActiveOrganizationId &&
			pendingActiveOrganizationId === activeOrganizationId
		) {
			setPendingActiveOrganizationId(null);
		}
	}, [
		activeOrganizationId,
		pendingActiveOrganizationId,
		setPendingActiveOrganizationId,
	]);

	return <>{children}</>;
}

export function useOrganizationsContext() {
	const { organizations, activeOrganizationId, isLoading } =
		useOrganizationsQuery();
	const pendingActiveOrganizationId = useAtomValue(
		pendingActiveOrganizationIdAtom
	);

	const activeOrganization = useMemo(() => {
		if (!activeOrganizationId) {
			return null;
		}
		return organizations.find((org) => org.id === activeOrganizationId) ?? null;
	}, [organizations, activeOrganizationId]);

	const getOrganization = useCallback(
		(orgSlug: string) => organizations.find((org) => org.slug === orgSlug),
		[organizations]
	);

	return {
		organizations,
		activeOrganization,
		activeOrganizationId,
		isLoading,
		isSwitchingOrganization: pendingActiveOrganizationId !== null,
		getOrganization,
	};
}
