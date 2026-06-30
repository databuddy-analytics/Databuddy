"use client";

import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { WebsiteOverviewTab } from "@/app/(main)/websites/[id]/_components/tabs/overview-tab";
import { EmptyState } from "@/app/(main)/websites/[id]/_components/utils/ui-components";
import { useDateFilters } from "@/hooks/use-date-filters";
import { usePublicWebsiteSummary } from "@/hooks/use-websites";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
} from "@/stores/jotai/filterAtoms";
import { WarningIcon } from "@databuddy/ui/icons";

export default function PublicDashboardPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [filters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilter] = useAtom(addDynamicFilterAtom);
	const { dateRange } = useDateFilters();
	const {
		data: websiteData,
		isLoading,
		isError,
	} = usePublicWebsiteSummary(websiteId);

	if (isError || !(isLoading || websiteData)) {
		return (
			<div className="select-none py-8">
				<EmptyState
					description="This dashboard is not available or has been set to private."
					icon={
						<WarningIcon
							aria-hidden="true"
							className="size-12"
							weight="duotone"
						/>
					}
					title="Dashboard not available"
				/>
			</div>
		);
	}

	const tabProps = {
		websiteId,
		dateRange,
		filters,
		addFilter,
	};

	return (
		<div className="p-4 sm:p-6">
			<WebsiteOverviewTab {...tabProps} />
		</div>
	);
}
