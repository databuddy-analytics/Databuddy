"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { WarningIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useTrackingSetup } from "@/hooks/use-tracking-setup";
import { useWebsite } from "@/hooks/use-websites";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";
import type {
	FullTabProps,
	WebsiteDataTabProps,
} from "./_components/utils/types";
import { EmptyState } from "./_components/utils/ui-components";

const LoadingSkeleton = () => (
	<div className="select-none space-y-6">
		<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
			{[1, 2, 3, 4, 5, 6].map((num) => (
				<div
					className="rounded border border-sidebar-border bg-sidebar p-4"
					key={`metric-skeleton-${num}`}
				>
					<div className="space-y-2">
						<Skeleton className="h-4 w-20" />
						<Skeleton className="h-8 w-16" />
						<Skeleton className="h-3 w-16" />
					</div>
				</div>
			))}
		</div>
		<div className="rounded border border-sidebar-border bg-sidebar shadow-sm">
			<div className="flex flex-col items-start justify-between gap-3 border-sidebar-border border-b p-4 sm:flex-row">
				<div className="space-y-2">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-4 w-48" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-8 w-20" />
					<Skeleton className="h-8 w-20" />
					<Skeleton className="h-8 w-20" />
				</div>
			</div>
			<div className="p-4">
				<Skeleton className="h-80 w-full" />
			</div>
		</div>
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
			{[1, 2].map((tableNum) => (
				<div
					className="rounded border border-sidebar-border bg-sidebar"
					key={`table-skeleton-${tableNum}`}
				>
					<div className="border-sidebar-border border-b p-4">
						<Skeleton className="h-5 w-24" />
						<Skeleton className="mt-1 h-4 w-32" />
					</div>
					<div className="space-y-3 p-4">
						{[1, 2, 3, 4, 5].map((rowNum) => (
							<div
								className="flex items-center justify-between"
								key={`row-skeleton-${rowNum}`}
							>
								<div className="flex items-center gap-3">
									<Skeleton className="h-4 w-4" />
									<Skeleton className="h-4 w-32" />
								</div>
								<div className="flex items-center gap-4">
									<Skeleton className="h-4 w-12" />
									<Skeleton className="h-5 w-10 rounded-full" />
								</div>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
			{[1, 2, 3].map((techNum) => (
				<div
					className="rounded border border-sidebar-border bg-sidebar"
					key={`tech-skeleton-${techNum}`}
				>
					<div className="border-sidebar-border border-b p-4">
						<Skeleton className="h-5 w-20" />
						<Skeleton className="mt-1 h-4 w-28" />
					</div>
					<div className="space-y-3 p-4">
						{[1, 2, 3, 4].map((rowNum) => (
							<div
								className="flex items-center justify-between"
								key={`tech-row-skeleton-${rowNum}`}
							>
								<div className="flex items-center gap-3">
									<Skeleton className="h-6 w-6" />
									<Skeleton className="h-4 w-24" />
								</div>
								<div className="flex items-center gap-3">
									<Skeleton className="h-4 w-8" />
									<Skeleton className="h-5 w-12 rounded-full" />
								</div>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	</div>
);

const WebsiteOverviewTab = dynamic(
	() =>
		import("./_components/tabs/overview-tab").then((mod) => ({
			default: mod.WebsiteOverviewTab,
		})),
	{ loading: () => <LoadingSkeleton />, ssr: false }
);
const WebsiteTrackingSetupTab = dynamic(
	() =>
		import("./_components/tabs/tracking-setup-tab").then((mod) => ({
			default: mod.WebsiteTrackingSetupTab,
		})),
	{ loading: () => <LoadingSkeleton />, ssr: false }
);

function WebsiteDetailsPage() {
	const { id } = useParams();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilterAction] = useAtom(addDynamicFilterAtom);

	const { dateRange } = useDateFilters();

	const { data, isLoading, isError } = useWebsite(id as string);

	const { isTrackingSetup, isTrackingSetupLoading } = useTrackingSetup(
		id as string
	);

	const addFilter = useCallback(
		(filter: DynamicQueryFilter) => {
			addFilterAction(filter);
		},
		[addFilterAction]
	);

	const tabProps: FullTabProps = {
		websiteId: id as string,
		dateRange,
		websiteData: data,
		isRefreshing,
		setIsRefreshing,
		filters: selectedFilters,
		addFilter,
	};

	const settingsProps: WebsiteDataTabProps = {
		websiteId: id as string,
		dateRange,
		websiteData: data,
	};

	if (isError || !(isLoading || data)) {
		return (
			<div className="select-none py-8">
				<EmptyState
					action={
						<Link href="/websites">
							<Button size="sm">Back to Websites</Button>
						</Link>
					}
					description="The website you are looking for does not exist or you do not have access."
					icon={
						<WarningIcon
							aria-hidden="true"
							className="size-12"
							weight="duotone"
						/>
					}
					title="Website not found"
				/>
			</div>
		);
	}

	if (isLoading || isTrackingSetupLoading || isTrackingSetup === null) {
		return (
			<div className="p-6">
				<LoadingSkeleton />
			</div>
		);
	}

	if (isTrackingSetup === false) {
		return (
			<div className="p-6">
				<WebsiteTrackingSetupTab {...settingsProps} />
			</div>
		);
	}

	return (
		<div className="px-4 pt-0 pb-4 sm:pt-4">
			<div className="space-y-2 pt-2">
				<WebsiteOverviewTab {...tabProps} />
			</div>
		</div>
	);
}

export default function Page() {
	return <WebsiteDetailsPage />;
}
