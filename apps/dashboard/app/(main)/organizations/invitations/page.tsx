"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations } from "@/hooks/use-organizations";
import { InvitationsView } from "./invitations-view";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-8 w-8 rounded-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-3 w-32" />
			</div>
			<Skeleton className="h-7 w-7" />
		</div>
	);
}

function PageSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="border-b lg:border-b-0 lg:border-r">
				<div className="flex gap-4 border-b px-5 py-3">
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-24" />
					<Skeleton className="h-8 w-24" />
				</div>
				<div className="divide-y">
					<SkeletonRow />
					<SkeletonRow />
					<SkeletonRow />
				</div>
			</div>
			<div className="space-y-4 bg-muted/30 p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

export default function InvitationsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return <PageSkeleton />;
	}

	return (
		<Suspense fallback={<PageSkeleton />}>
			<InvitationsView organization={activeOrganization} />
		</Suspense>
	);
}
