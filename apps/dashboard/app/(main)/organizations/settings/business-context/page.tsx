"use client";

import { useOrganizations } from "@/hooks/use-organizations";
import { BusinessContextSettings } from "../../components/business-context-settings";
import { BusinessContextSkeleton } from "../../components/business-context-layout";

export default function OrganizationBusinessContextPage() {
	const { activeOrganization, isSwitchingOrganization } = useOrganizations();

	if (!activeOrganization || isSwitchingOrganization) {
		return <BusinessContextSkeleton />;
	}

	return (
		<BusinessContextSettings
			key={activeOrganization.id}
			organizationId={activeOrganization.id}
		/>
	);
}
