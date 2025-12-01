"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { WarningIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
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
import { WebsiteOverviewTab } from "./_components/tabs/overview-tab";
import { TabLoadingSkeleton } from "./_components/utils/tab-layout";

const WebsiteTrackingSetupTab = dynamic(
	() =>
		import("./_components/tabs/tracking-setup-tab").then((mod) => ({
			default: mod.WebsiteTrackingSetupTab,
		})),
	{ loading: () => <TabLoadingSkeleton />, ssr: false }
);

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

	if (isLoading === null) {
		return (
			<div className="p-4">
				<TabLoadingSkeleton />
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
