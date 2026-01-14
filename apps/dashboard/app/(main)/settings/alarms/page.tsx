"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlarmSettings } from "./alarm-settings";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="size-10 rounded" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="h-6 w-16 rounded-full" />
			<Skeleton className="size-4" />
		</div>
	);
}

function PageSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0">
				<SkeletonRow />
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-card p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
			</div>
		</div>
	);
}

export default function AlarmsSettingsPage() {
	return (
		<Suspense fallback={<PageSkeleton />}>
			<AlarmSettings />
		</Suspense>
	);
}
