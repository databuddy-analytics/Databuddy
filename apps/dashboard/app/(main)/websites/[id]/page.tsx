"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import Link from "next/link";
import { useParams } from "next/navigation";
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

export default function WebsiteDetailsPage() {
	const { id } = useParams();
	const websiteId = id as string;

	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [filters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilter] = useAtom(addDynamicFilterAtom);

	const { dateRange } = useDateFilters();
	const { data: websiteData, isLoading, isError } = useWebsite(websiteId);

	if (isError || !(isLoading || websiteData)) {
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

	const tabProps: FullTabProps = {
		websiteId,
		dateRange,
		websiteData,
		isRefreshing,
		setIsRefreshing,
		filters,
		addFilter,
	};

	return (
		<div className="p-4">
			<WebsiteOverviewTab {...tabProps} />
		</div>
	);
}
