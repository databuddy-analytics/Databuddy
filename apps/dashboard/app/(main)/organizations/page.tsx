"use client";

import { Suspense } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { OrganizationsList } from "./components/organizations-list";
import { OrganizationsListSkeleton } from "./components/settings-skeletons";

export default function OrganizationsPage() {
	const { organizations, activeOrganization, isLoading } =
		useOrganizationsContext();

	if (isLoading) {
		return <OrganizationsListSkeleton />;
	}

	return (
		<Suspense fallback={<OrganizationsListSkeleton />}>
			<OrganizationsList
				activeOrganization={activeOrganization}
				organizations={organizations}
			/>
		</Suspense>
	);
}
