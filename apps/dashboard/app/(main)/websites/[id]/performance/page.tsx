"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { useAtom } from "jotai";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useTrackingSetup } from "@/hooks/use-tracking-setup";
import { useWebsite } from "@/hooks/use-websites";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";

const PerformanceContent = dynamic(
	() =>
		import("../_components/tabs/performance-tab").then((mod) => ({
			default: mod.WebsitePerformanceTab,
		})),
	{
		loading: () => (
			<div className="space-y-4">
				{/* Web Vitals Chart Skeleton */}
				<div className="rounded border bg-sidebar">
					<div className="border-b p-4">
						<Skeleton className="h-5 w-32" />
						<Skeleton className="mt-1 h-4 w-64" />
					</div>
					<div className="p-4">
						<div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
							{[1, 2, 3, 4].map((num) => (
								<div
									className="rounded border bg-background p-3"
									key={`metric-skeleton-${num}`}
								>
									<Skeleton className="mb-2 h-4 w-16" />
									<Skeleton className="h-6 w-20" />
									<Skeleton className="mt-1 h-3 w-12" />
								</div>
							))}
						</div>
						<Skeleton className="h-80 w-full" />
					</div>
				</div>
				{/* Summary Cards Skeleton */}
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					{[1, 2, 3, 4].map((num) => (
						<div
							className="rounded border bg-sidebar p-4"
							key={`summary-skeleton-${num}`}
						>
							<Skeleton className="mb-2 h-4 w-24" />
							<Skeleton className="h-8 w-20" />
						</div>
					))}
				</div>
				{/* Table Skeleton */}
				<div className="rounded border bg-sidebar">
					<div className="border-b p-4">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="mt-1 h-4 w-64" />
					</div>
					<div className="p-4">
						<Skeleton className="h-96 w-full" />
					</div>
				</div>
			</div>
		),
		ssr: false,
	}
);

export default function PerformancePage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilterAction] = useAtom(addDynamicFilterAtom);

	const { dateRange } = useDateFilters();
	const { data: websiteData } = useWebsite(websiteId);
	const { isTrackingSetup, isTrackingSetupLoading } =
		useTrackingSetup(websiteId);

	const addFilter = useCallback(
		(filter: DynamicQueryFilter) => {
			addFilterAction(filter);
		},
		[addFilterAction]
	);

	if (isTrackingSetupLoading) {
		return (
			<div className="space-y-4 p-4">
				<div className="rounded border bg-sidebar">
					<div className="border-b p-4">
						<Skeleton className="h-5 w-32" />
						<Skeleton className="mt-1 h-4 w-64" />
					</div>
					<div className="p-4">
						<Skeleton className="h-80 w-full" />
					</div>
				</div>
			</div>
		);
	}

	if (isTrackingSetup === false) {
		return (
			<div className="p-4">
				<div className="rounded border bg-sidebar p-8 text-center">
					<p className="text-sidebar-foreground/70">
						Please set up tracking to view performance data.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4">
			<ErrorBoundary>
				<PerformanceContent
					addFilter={addFilter}
					dateRange={dateRange}
					filters={selectedFilters}
					isRefreshing={isRefreshing}
					setIsRefreshing={setIsRefreshing}
					websiteData={websiteData}
					websiteId={websiteId}
				/>
			</ErrorBoundary>
		</div>
	);
}
