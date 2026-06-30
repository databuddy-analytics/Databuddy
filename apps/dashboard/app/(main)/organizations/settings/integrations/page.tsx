"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import {
	IntegrationsSettings,
	IntegrationsSettingsSkeleton,
} from "../../components/integrations-settings";

export default function OrganizationIntegrationsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return <IntegrationsSettingsSkeleton />;
	}

	return (
		<Suspense fallback={<IntegrationsSettingsSkeleton />}>
			<IntegrationsSettings organization={activeOrganization} />
		</Suspense>
	);
}
