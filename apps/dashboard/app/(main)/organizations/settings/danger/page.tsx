"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { DangerZoneSkeleton } from "../../components/settings-skeletons";
import { DangerZoneSettings } from "./danger-zone-settings";

export default function DangerZoneSettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return <DangerZoneSkeleton />;
	}

	return (
		<Suspense fallback={<DangerZoneSkeleton />}>
			<DangerZoneSettings organization={activeOrganization} />
		</Suspense>
	);
}
