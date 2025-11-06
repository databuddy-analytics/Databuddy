"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { WebsiteSettings } from "./website-settings";

const ComponentSkeleton = () => (
	<div className="h-full p-6">
		<div className="space-y-4">
			<div className="h-32 w-full animate-pulse rounded bg-muted" />
			<div className="h-24 w-full animate-pulse rounded bg-muted" />
		</div>
	</div>
);

export default function WebsitesSettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return null;
	}

	return (
		<Suspense fallback={<ComponentSkeleton />}>
			<WebsiteSettings organization={activeOrganization} />
		</Suspense>
	);
}
