"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations } from "@/hooks/use-organizations";
import { DangerZoneSettings } from "./danger-zone-settings";

function PageSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="space-y-6 border-b p-5 lg:border-b-0">
				{/* Transfer section */}
				<div>
					<Skeleton className="mb-1 h-5 w-32" />
					<Skeleton className="mb-4 h-4 w-64" />
					<div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
						<div className="space-y-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-32 w-full rounded" />
						</div>
						<div className="flex items-center justify-center">
							<Skeleton className="h-9 w-9 rounded" />
						</div>
						<div className="space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-32 w-full rounded" />
						</div>
					</div>
				</div>

				{/* Destructive action */}
				<div className="rounded border border-destructive/20 bg-destructive/5 p-4">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-2">
							<Skeleton className="h-5 w-40" />
							<Skeleton className="h-4 w-56" />
						</div>
						<Skeleton className="h-8 w-20" />
					</div>
				</div>
			</div>

			<div className="space-y-4 bg-card p-5">
				<Skeleton className="h-20 w-full rounded" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="mt-auto h-20 w-full rounded" />
			</div>
		</div>
	);
}

export default function DangerZoneSettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return <PageSkeleton />;
	}

	return (
		<Suspense fallback={<PageSkeleton />}>
			<DangerZoneSettings organization={activeOrganization} />
		</Suspense>
	);
}
