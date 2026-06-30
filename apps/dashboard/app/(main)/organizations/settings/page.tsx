"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { GeneralSettings } from "../components/general-settings";
import { GeneralSettingsSkeleton } from "../components/settings-skeletons";

export default function SettingsPage() {
	const { activeOrganization, isSwitchingOrganization } = useOrganizations();

	if (isSwitchingOrganization) {
		return <GeneralSettingsSkeleton />;
	}

	if (!activeOrganization) {
		return <GeneralSettingsSkeleton />;
	}

	return (
		<Suspense fallback={<GeneralSettingsSkeleton />}>
			<GeneralSettings organization={activeOrganization} />
		</Suspense>
	);
}
