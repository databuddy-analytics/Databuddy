"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations } from "@/hooks/use-organizations";
import { GeneralSettings } from "../components/general-settings";

function PageSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="space-y-6 border-b p-5 lg:border-b-0 lg:border-r">
				{/* Logo */}
				<div className="flex items-center gap-3">
					<Skeleton className="h-16 w-16 rounded-full" />
					<div className="space-y-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-48" />
					</div>
				</div>
				{/* Inputs */}
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-10 w-full" />
					</div>
					<div className="space-y-2">
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
			</div>
			<div className="space-y-4 bg-muted/30 p-5">
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="mt-auto h-20 w-full rounded" />
			</div>
		</div>
	);
}

export default function SettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return <PageSkeleton />;
	}

	return (
		<Suspense fallback={<PageSkeleton />}>
			<GeneralSettings organization={activeOrganization} />
		</Suspense>
	);
}
