"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations } from "@/hooks/use-organizations";
import { ApiKeySettings } from "./api-key-settings";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-10 w-10 rounded" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="h-6 w-16 rounded-full" />
			<Skeleton className="h-4 w-4" />
		</div>
	);
}

function PageSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0 lg:border-r">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-muted/30 p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

export default function ApiKeysSettingsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return <PageSkeleton />;
	}

	return (
		<Suspense fallback={<PageSkeleton />}>
			<ApiKeySettings organization={activeOrganization} />
		</Suspense>
	);
}
