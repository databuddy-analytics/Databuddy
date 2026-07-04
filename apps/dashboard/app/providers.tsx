"use client";

import { publicConfig } from "@databuddy/env/public";

import { authClient } from "@databuddy/auth/client";
import { FlagsProvider } from "@databuddy/sdk/react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useEffect, useMemo, useState } from "react";
import { IdentifyUser } from "@/components/providers/identify-user";
import { OrganizationsProvider } from "@/components/providers/organizations-provider";
import { useToastTracking } from "@/hooks/toast-hooks";
import { isDashboardE2E } from "@/lib/e2e-mode";
import {
	clearPersistedQueryCache,
	getQueryClient,
	makeQueryPersister,
	persistOptions,
	readPersistedCacheOwner,
	writePersistedCacheOwner,
} from "@/lib/query-client";

export default function Providers({ children }: { children: React.ReactNode }) {
	const { data: session, isPending } = authClient.useSession();
	const userId = session?.user?.id;
	const [queryClient] = useState(getQueryClient);
	const persister = useMemo(() => makeQueryPersister(userId), [userId]);
	const shouldPersist = !(isDashboardE2E || isPending) && Boolean(userId);

	const content = (
		<FlagsProviderWrapper>
			<OrganizationsProvider>
				<IdentifyUser />
				<PersistedCacheOwnerGuard />
				<ToastTracker>
					<NuqsAdapter>{children}</NuqsAdapter>
				</ToastTracker>
			</OrganizationsProvider>
		</FlagsProviderWrapper>
	);

	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				{shouldPersist ? (
					<PersistQueryClientProvider
						client={queryClient}
						persistOptions={{ ...persistOptions, persister }}
					>
						{content}
					</PersistQueryClientProvider>
				) : (
					<QueryClientProvider client={queryClient}>
						{content}
					</QueryClientProvider>
				)}
			</div>
		</ThemeProvider>
	);
}

function PersistedCacheOwnerGuard() {
	const { data: session, isPending } = authClient.useSession();
	const queryClient = useQueryClient();
	const userId = session?.user?.id;

	useEffect(() => {
		if (isPending || !userId) {
			return;
		}
		const owner = readPersistedCacheOwner();
		if (owner && owner !== userId) {
			clearPersistedQueryCache();
			queryClient.clear();
		}
		writePersistedCacheOwner(userId);
	}, [isPending, userId, queryClient]);

	return null;
}

function FlagsProviderWrapper({ children }: { children: React.ReactNode }) {
	const { data: session, isPending } = authClient.useSession();
	const isE2E = isDashboardE2E;

	const apiUrl = publicConfig.urls.api;
	const clientId =
		process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID ?? "OXmNQsViBT-FOS_wZCTHc";

	const userId = session?.user?.id;
	const userEmail = session?.user?.email;
	const user = useMemo(
		() => (userId ? { userId, email: userEmail } : undefined),
		[userId, userEmail]
	);

	return (
		<FlagsProvider
			apiUrl={apiUrl}
			autoFetch={!isE2E}
			clientId={clientId}
			disabled={isE2E}
			isPending={isPending}
			skipStorage={isE2E}
			user={user}
		>
			{children}
		</FlagsProvider>
	);
}

function ToastTracker({ children }: { children: React.ReactNode }) {
	useToastTracking();
	return <>{children}</>;
}
