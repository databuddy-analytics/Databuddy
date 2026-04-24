"use client";

import { authClient } from "@databuddy/auth/client";
import { FlagsProvider } from "@databuddy/sdk/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useMemo, useState } from "react";
import { OrganizationsProvider } from "@/components/providers/organizations-provider";
import { useToastTracking } from "@/hooks/toast-hooks";
import { getQueryClient } from "@/lib/query-client";

export default function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(getQueryClient);

	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<QueryClientProvider client={queryClient}>
					<FlagsProviderWrapper>
						<OrganizationsProvider>
							<ToastTracker>
								<NuqsAdapter>{children}</NuqsAdapter>
							</ToastTracker>
						</OrganizationsProvider>
					</FlagsProviderWrapper>
				</QueryClientProvider>
			</div>
		</ThemeProvider>
	);
}

function FlagsProviderWrapper({ children }: { children: React.ReactNode }) {
	const { data: session, isPending } = authClient.useSession();

	const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
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
			clientId={clientId}
			isPending={isPending}
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
