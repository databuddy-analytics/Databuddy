"use client";

import { FingerprintIcon } from "@phosphor-icons/react";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizations } from "@/hooks/use-organizations";
import { SSOSettings } from "./sso-settings";

function SkeletonRow() {
	return (
		<div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
			<Skeleton className="h-10 w-10 rounded" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-48" />
			</div>
			<Skeleton className="h-6 w-16 rounded-full" />
		</div>
	);
}

function PageSkeleton() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="divide-y border-b lg:border-b-0">
				<SkeletonRow />
				<SkeletonRow />
			</div>
			<div className="space-y-4 bg-card p-5">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-18 w-full rounded" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-20 w-full rounded" />
			</div>
		</div>
	);
}

export default function SSOSettingsPage() {
	const { activeOrganization, isLoading } = useOrganizations();

	if (isLoading) {
		return <PageSkeleton />;
	}

	if (!activeOrganization) {
		return (
			<EmptyState
				description="Select or create an organization to configure SSO settings"
				icon={<FingerprintIcon weight="duotone" />}
				title="No organization selected"
			/>
		);
	}

	return (
		<Suspense fallback={<PageSkeleton />}>
			<SSOSettings organization={activeOrganization} />
		</Suspense>
	);
}
