"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { ApiKeysSkeleton } from "../../components/settings-skeletons";
import { ApiKeySettings } from "./api-key-settings";

export default function ApiKeysSettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return <ApiKeysSkeleton />;
	}

	return (
		<Suspense fallback={<ApiKeysSkeleton />}>
			<ApiKeySettings organization={activeOrganization} />
		</Suspense>
	);
}
