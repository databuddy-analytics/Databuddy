"use client";

import { authClient, useSession } from "@databuddy/auth/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue, useStore } from "jotai";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import {
	ORGANIZATIONS_QUERY_KEY,
	resetActiveOrganizationQueries,
} from "@/lib/active-organization-queries";
import { pendingActiveOrganizationIdAtom } from "@/stores/jotai/organizationsAtoms";
export type { Organization } from "@/stores/jotai/organization-types";

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
		queryKey: ORGANIZATIONS_QUERY_KEY,
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
	const queryClient = useQueryClient();
	const store = useStore();

	// Better Auth raises this signal after every call that changes the session:
	// switching, creating, deleting or leaving an organization, accepting an
	// invitation, being removed, and signing out. An explicit switch has already
	// reset the queries before it navigates.
	useEffect(
		() =>
			authClient.$store.atoms.$sessionSignal?.listen(() => {
				if (store.get(pendingActiveOrganizationIdAtom) === null) {
					resetActiveOrganizationQueries(queryClient);
				}
			}),
		[queryClient, store]
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
