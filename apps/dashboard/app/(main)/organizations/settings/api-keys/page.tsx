"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { ApiKeySettings } from "./api-key-settings";

const ComponentSkeleton = () => (
	<div className="h-full p-6">
		<div className="space-y-4">
			{Array.from({ length: 4 }).map((_, i) => (
				<div
					className="flex items-center justify-between rounded-lg border bg-card p-4"
					key={i.toString()}
				>
					<div className="flex items-center gap-3">
						<div className="h-8 w-8 animate-pulse rounded bg-muted" />
						<div className="space-y-2">
							<div className="h-4 w-32 animate-pulse rounded bg-muted" />
							<div className="h-3 w-24 animate-pulse rounded bg-muted" />
						</div>
					</div>
					<div className="flex items-center gap-2">
						<div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
						<div className="h-8 w-8 animate-pulse rounded bg-muted" />
					</div>
				</div>
			))}
		</div>
	</div>
);

export default function ApiKeysSettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return null;
	}

	return (
		<Suspense fallback={<ComponentSkeleton />}>
			<ApiKeySettings organization={activeOrganization} />
		</Suspense>
	);
}
