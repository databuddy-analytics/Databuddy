'use client';

import { authClient } from '@databuddy/auth/client';
import { Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OrganizationsList } from './components/organizations-list';

function OrganizationsSkeleton() {
	return (
		<div className="h-full p-4 sm:p-6">
			<div className="grid auto-rows-fr gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<Card className="animate-pulse" key={`org-skeleton-${i.toString()}`}>
						<CardContent className="p-4 sm:p-6">
							<div className="flex items-center gap-3 sm:gap-4">
								<Skeleton className="h-10 w-10 flex-shrink-0 rounded-full sm:h-12 sm:w-12" />
								<div className="min-w-0 flex-1 space-y-2">
									<Skeleton className="h-3 w-28 sm:h-4 sm:w-32" />
									<Skeleton className="h-3 w-20 sm:h-3 sm:w-24" />
									<Skeleton className="h-3 w-24 sm:h-3 sm:w-28" />
								</div>
							</div>
							<div className="mt-4 space-y-3 sm:mt-6">
								<Skeleton className="h-9 w-full sm:h-10" />
								<div className="flex gap-2">
									<Skeleton className="h-9 flex-1 sm:h-10" />
									<Skeleton className="h-9 w-9 sm:h-10 sm:w-10" />
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

export default function OrganizationsPage() {
	const { data: organizations, isPending: isOrganizationsPending } =
		authClient.useListOrganizations();
	const { data: activeOrganization, isPending: isActiveOrganizationPending } =
		authClient.useActiveOrganization();

	const isLoading = isOrganizationsPending || isActiveOrganizationPending;

	return (
		<div className="flex h-full flex-col">
			<Suspense fallback={<OrganizationsSkeleton />}>
				<OrganizationsList
					activeOrganization={activeOrganization}
					isLoading={isLoading}
					organizations={organizations}
				/>
			</Suspense>
		</div>
	);
}
