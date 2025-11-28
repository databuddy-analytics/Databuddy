"use client";

import { authClient } from "@databuddy/auth/client";
import { type ReactNode } from "react";
import { useOrganizations } from "@/hooks/use-organizations";

export type Organization = NonNullable<
  ReturnType<typeof authClient.useListOrganizations>["data"]
>[number];

export function OrganizationsProvider({ children }: { children: ReactNode }) {
  // This provider is kept for backwards compatibility but no longer fetches data
  // Data fetching is handled by useOrganizations hook to avoid duplicate requests
  return <>{children}</>;
}

/**
 * @deprecated Use useOrganizations from @/hooks/use-organizations instead
 * This is kept for backwards compatibility
 */
export function useOrganizationsContext() {
  const { organizations, activeOrganization, isLoading } = useOrganizations();

  return {
    organizations,
    activeOrganization,
    isLoading,
    getOrganization: (orgSlug: string) =>
      organizations.find((org) => org.slug === orgSlug),
  };
}
