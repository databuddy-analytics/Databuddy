"use client";

import { OrganizationsProvider } from "@/components/providers/organizations-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToastTracking } from "@/hooks/toast-hooks";
import { isAbortError } from "@/lib/is-abort-error";
import { authClient } from "@databuddy/auth/client";
import { trackError } from "@databuddy/sdk";
import { FlagsProvider } from "@databuddy/sdk/react";
import {
	MutationCache,
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { toast } from "sonner";

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

function isSilencedError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const rpcError = error as {
		data?: { code?: string; message?: string };
		code?: string;
		message?: string;
	};

	const errorCode = rpcError.data?.code ?? rpcError.code;
	if (errorCode === "UNAUTHORIZED" || errorCode === "AUTH_REQUIRED") {
		return true;
	}

	const errorMessage = (
		rpcError.data?.message ??
		rpcError.message ??
		String(error)
	).toLowerCase();

	if (
		errorMessage.includes("authentication") ||
		errorMessage.includes("unauthorized") ||
		errorMessage.includes("unauthenticated") ||
		errorMessage.includes("401")
	) {
		return true;
	}

	if (
		errorCode === "FORBIDDEN" ||
		errorMessage.includes("forbidden") ||
		errorMessage.includes("invite-only")
	) {
		return true;
	}

	return false;
}

const queryClient = new QueryClient({
	defaultOptions: defaultQueryClientOptions.defaultOptions,
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (isAbortError(error)) {
				return;
			}
			if (isSilencedError(error)) {
				return;
			}
			if (query.queryKey[0] === "og-preview") {
				return;
			}

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
			if (isAbortError(error)) {
				return;
			}
			if (isSilencedError(error)) {
				return;
			}

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
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
			</div>
		</ThemeProvider>
	);
}

function FlagsProviderWrapper({ children }: { children: React.ReactNode }) {
	const { data: session, isPending } = authClient.useSession();

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
