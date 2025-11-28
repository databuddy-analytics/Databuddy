"use client";

import { Suspense } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { OrganizationsList } from "./components/organizations-list";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-10 w-10 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-24" />
			</div>
			<Skeleton className="h-6 w-14 rounded-full" />
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
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-20 w-full rounded" />
			</div>
		</div>
	);
}

export default function OrganizationsPage() {
	const { organizations, activeOrganization, isLoading } =
		useOrganizationsContext();

	if (isLoading) {
		return <PageSkeleton />;
	}

	return (
		<Suspense fallback={<PageSkeleton />}>
			<OrganizationsList
				activeOrganization={activeOrganization}
				organizations={organizations}
			/>
		</Suspense>
	);
}
