"use client";

import { useOrganizations } from "@/hooks/use-organizations";
import {
	BusinessContextSettings,
	BusinessContextSkeleton,
} from "../../components/business-context-settings";

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
