"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { GeneralSettings } from "../components/general-settings";

const ComponentSkeleton = () => (
	<div className="h-full p-6">
		<div className="space-y-8">
			{/* Header skeleton */}
			<div className="flex items-center gap-4">
				<div className="h-12 w-12 animate-pulse rounded bg-muted" />
				<div className="space-y-2">
					<div className="h-6 w-48 animate-pulse rounded bg-muted" />
					<div className="h-4 w-64 animate-pulse rounded bg-muted" />
				</div>
			</div>
			{/* Content skeletons */}
			<div className="space-y-8">
				<div className="rounded border bg-card p-6">
					<div className="space-y-4">
						<div className="h-5 w-32 animate-pulse rounded bg-muted" />
						<div className="h-16 w-full animate-pulse rounded bg-muted" />
					</div>
				</div>
				<div className="rounded border bg-card p-6">
					<div className="space-y-4">
						<div className="h-5 w-40 animate-pulse rounded bg-muted" />
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="h-10 animate-pulse rounded bg-muted" />
							<div className="h-10 animate-pulse rounded bg-muted" />
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
);

export default function SettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return null;
	}

	return (
		<Suspense fallback={<ComponentSkeleton />}>
			<GeneralSettings organization={activeOrganization} />
		</Suspense>
	);
}
