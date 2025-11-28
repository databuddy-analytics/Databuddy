"use client";

import { authClient } from "@databuddy/auth/client";
import { FlagsProvider } from "@databuddy/sdk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AutumnProvider } from "autumn-js/react";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useMemo, useState, useEffect } from "react";

const defaultQueryClientOptions = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
    },
    mutations: { retry: false },
  },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        ...defaultQueryClientOptions,
      })
  );

  // 🔥 Call useSession ONLY once
  const { data: rawSession, isPending } = authClient.useSession();

  // 🔥 Store in state so re-renders DO NOT refetch
  const [session, setSession] = useState(rawSession);

  useEffect(() => {
    if (rawSession) setSession(rawSession);
  }, [rawSession]);

  // Prevent refetch storm during pending
  if (isPending && !session) return null;

  const user = session?.user
    ? {
        userId: session.user.id,
        email: session.user.email,
      }
    : undefined;

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <FlagsProvider
          clientId="3ed1fce1-5a56-4cb6-a977-66864f6d18e3"
          user={user}
        >
          <AutumnProvider
            backendUrl={
              process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
            }
          >
            <NuqsAdapter>{children}</NuqsAdapter>
          </AutumnProvider>
        </FlagsProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
