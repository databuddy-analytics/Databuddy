"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { DangerZoneSettings } from "./danger-zone-settings";

const ComponentSkeleton = () => (
	<div className="h-full p-6">
		<div className="space-y-8">
			{/* Transfer assets skeleton */}
			<div className="rounded border bg-card">
				<div className="border-b p-6">
					<div className="h-5 w-32 animate-pulse rounded bg-muted" />
					<div className="mt-2 h-4 w-64 animate-pulse rounded bg-muted" />
				</div>
				<div className="p-6">
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr]">
						<div className="space-y-3">
							{Array.from({ length: 3 }).map((_, i) => (
								<div
									className="flex items-center gap-2 rounded border p-2"
									key={i.toString()}
								>
									<div className="h-4 w-4 animate-pulse rounded bg-muted" />
									<div className="space-y-1">
										<div className="h-3 w-20 animate-pulse rounded bg-muted" />
										<div className="h-2 w-24 animate-pulse rounded bg-muted" />
									</div>
								</div>
							))}
						</div>
						<div className="flex items-center justify-center">
							<div className="h-8 w-8 animate-pulse rounded bg-muted" />
						</div>
						<div className="space-y-3">
							{Array.from({ length: 2 }).map((_, i) => (
								<div
									className="flex items-center gap-2 rounded border p-2"
									key={i.toString()}
								>
									<div className="h-4 w-4 animate-pulse rounded bg-muted" />
									<div className="space-y-1">
										<div className="h-3 w-20 animate-pulse rounded bg-muted" />
										<div className="h-2 w-24 animate-pulse rounded bg-muted" />
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* Delete section skeleton */}
			<div className="rounded border border-destructive/20 bg-destructive/5 p-6">
				<div className="space-y-4">
					<div className="h-5 w-40 animate-pulse rounded bg-muted" />
					<div className="h-4 w-72 animate-pulse rounded bg-muted" />
					<div className="flex justify-end">
						<div className="h-10 w-32 animate-pulse rounded bg-muted" />
					</div>
				</div>
			</div>
		</div>
	</div>
);

export default function DangerZoneSettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return null;
	}

	return (
		<Suspense fallback={<ComponentSkeleton />}>
			<DangerZoneSettings organization={activeOrganization} />
		</Suspense>
	);
}
