'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { AutumnProvider } from 'autumn-js/react';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useState } from 'react';
import superjson from 'superjson';
import { SessionProvider } from '@/components/layout/session-provider';
import { trpc } from '@/lib/trpc';

const defaultQueryClientOptions = {
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 10 * 60 * 1000, // 10 minutes
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

export default function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				...defaultQueryClientOptions,
				defaultOptions: {
					...defaultQueryClientOptions.defaultOptions,
					queries: {
						...defaultQueryClientOptions.defaultOptions.queries,
						gcTime: 1000 * 60 * 5, // 5 minutes
						staleTime: 1000 * 60 * 2, // 2 minutes
					},
				},
			})
	);

	const [trpcClient] = useState(() =>
		trpc.createClient({
			links: [
				httpBatchLink({
					url: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trpc`,
					fetch: (url, options) =>
						fetch(url, {
							...options,
							credentials: 'include',
						}),
					transformer: superjson,
				}),
			],
		})
	);

	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<trpc.Provider client={trpcClient} queryClient={queryClient}>
				<QueryClientProvider client={queryClient}>
					<SessionProvider session={null}>
						<AutumnProvider
							backendUrl={
								process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
							}
						>
							<NuqsAdapter>{children}</NuqsAdapter>
						</AutumnProvider>
					</SessionProvider>
				</QueryClientProvider>
			</trpc.Provider>
		</ThemeProvider>
	);
}
