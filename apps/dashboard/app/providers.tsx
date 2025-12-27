"use client";

import { authClient } from "@databuddy/auth/client";
import { trackError } from "@databuddy/sdk";
import { FlagsProvider } from "@databuddy/sdk/react";
import {
	MutationCache,
	QueryCache,
	QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { toast } from "sonner";
import { OrganizationsProvider } from "@/components/providers/organizations-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToastTracking } from "@/hooks/toast-hooks";

const defaultQueryClientOptions = {
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 2, // 2 minutes
			gcTime: 1000 * 60 * 5, // 5 minutes
			refetchOnWindowFocus: false,
			refetchOnMount: true,
			refetchOnReconnect: true,
			retry: 1,
			retryDelay: (attemptIndex: number) =>
				Math.min(1000 * 2 ** attemptIndex, 30_000),
		},
		mutations: {
			retry: false,
		},
	},
};

const queryClient = new QueryClient({
	defaultOptions: defaultQueryClientOptions.defaultOptions,
	queryCache: new QueryCache({
		onError: (error) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			toast.error(message);
			trackError(message, {
				stack: error.stack,
				error_type: error.name,
				cause: error.cause ? String(error.cause) : undefined,
			});
		},
	}),
	mutationCache: new MutationCache({
		onError: (error) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			toast.error(message);
			trackError(message, {
				stack: error.stack,
				error_type: error.name,
				cause: error.cause ? String(error.cause) : undefined,
			});
		},
	}),
});

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>
					<FlagsProviderWrapper>
						<OrganizationsProvider>
							<ToastTracker>
								<NuqsAdapter>{children}</NuqsAdapter>
							</ToastTracker>
						</OrganizationsProvider>
					</FlagsProviderWrapper>
				</TooltipProvider>
			</QueryClientProvider>
		</ThemeProvider>
	);
}

// Query key for session - shared with other components for deduplication
export const SESSION_QUERY_KEY = ["auth", "session"] as const;

function FlagsProviderWrapper({ children }: { children: React.ReactNode }) {
	const { data: session, isPending } = useQuery({
		queryKey: SESSION_QUERY_KEY,
		queryFn: async () => {
			const result = await authClient.getSession();
			return result.data;
		},
		staleTime: 2 * 60 * 1000, // 2 minutes
		gcTime: 5 * 60 * 1000, // 5 minutes
	});

	const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
	const clientId =
		process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID ?? "OXmNQsViBT-FOS_wZCTHc";

	const user = session?.user
		? { userId: session.user.id, email: session.user.email }
		: undefined;

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
