"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { WarningIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useWebsite } from "@/hooks/use-websites";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";
import { WebsiteOverviewTab } from "./_components/tabs/overview-tab";
import type { FullTabProps } from "./_components/utils/types";
import { EmptyState } from "./_components/utils/ui-components";

function WebsiteDetailsPage() {
	const { id } = useParams();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [selectedFilters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilterAction] = useAtom(addDynamicFilterAtom);

	const { dateRange } = useDateFilters();

	const { data, isLoading, isError } = useWebsite(id as string);

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

	return (
		<div className="p-4">
			<WebsiteOverviewTab {...tabProps} />
		</div>
	);
}

export default function Page() {
	return <WebsiteDetailsPage />;
}
