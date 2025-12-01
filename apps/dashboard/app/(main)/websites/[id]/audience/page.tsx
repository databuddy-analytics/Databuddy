"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useWebsite } from "@/hooks/use-websites";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";
import { WebsiteAudienceTab } from "../_components/tabs/audience-tab";

export default function AudiencePage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilterAction] = useAtom(addDynamicFilterAtom);

	const { dateRange } = useDateFilters();
	const { data: websiteData } = useWebsite(websiteId);

	const addFilter = useCallback(
		(filter: DynamicQueryFilter) => {
			addFilterAction(filter);
		},
		[addFilterAction]
	);

	return (
		<div className="p-4">
			<ErrorBoundary>
				<WebsiteAudienceTab
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
