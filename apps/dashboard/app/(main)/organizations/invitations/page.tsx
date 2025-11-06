"use client";

import { Suspense } from "react";
import { useOrganizations } from "@/hooks/use-organizations";
import { InvitationsView } from "./invitations-view";

const ComponentSkeleton = () => (
	<div className="h-full p-6">
		<div className="space-y-6">
			{/* Tabs skeleton */}
			<div className="grid h-10 w-full grid-cols-3 gap-2 rounded border bg-muted p-1">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						className="h-8 animate-pulse rounded bg-background"
						key={i.toString()}
					/>
				))}
			</div>
			{/* Content skeleton */}
			<div className="space-y-4">
				{Array.from({ length: 6 }).map((_, i) => (
					<div
						className="flex items-center gap-4 rounded-lg border bg-card p-4"
						key={i.toString()}
					>
						<div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
						<div className="min-w-0 flex-1 space-y-2">
							<div className="h-4 w-48 animate-pulse rounded bg-muted" />
							<div className="h-3 w-40 animate-pulse rounded bg-muted" />
						</div>
						<div className="h-8 w-20 animate-pulse rounded bg-muted" />
					</div>
				))}
			</div>
		</div>
	</div>
);

export default function InvitationsPage() {
	const { activeOrganization } = useOrganizations();

	if (!activeOrganization) {
		return null;
	}

	return (
		<Suspense fallback={<ComponentSkeleton />}>
			<InvitationsView organization={activeOrganization} />
		</Suspense>
	);
}
