"use client";

import type { DynamicQueryFilter } from "@/types/api";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useCustomEventsData } from "@/hooks/use-custom-events";
import {
	DASHBOARD_FILTERS_QUERY_PARAM,
	parseDashboardFiltersParam,
} from "@/lib/dashboard-navigation-actions";
import { usePersistentState } from "@databuddy/ui";
import { useWebsitesLight } from "@/hooks/use-websites";
import { dayjs } from "@databuddy/ui";

/**
 * "no-website" = events not tied to any website
 * "all" = all events across the organization
 * string = a specific websiteId
 */
export type WebsiteFilterMode = "no-website" | "all" | string;

export interface WebsiteEntry {
	domain: string;
	id: string;
	name: string;
}

interface EventsPageContextValue {
	dateRange: {
		start_date: string;
		end_date: string;
		granularity: "daily" | "hourly";
	};
	hasQueryId: boolean;
	isLoadingOrg: boolean;
	isLoadingWebsites: boolean;
	query: ReturnType<typeof useCustomEventsData>;
	queryOptions: { websiteId?: string; organizationId?: string };
	selectedWebsite: WebsiteEntry | undefined;
	setWebsiteFilterMode: (mode: WebsiteFilterMode) => void;
	websiteFilterMode: WebsiteFilterMode;
	websiteFilters: DynamicQueryFilter[];
	websites: WebsiteEntry[];
}

const EventsPageContext = createContext<EventsPageContextValue | null>(null);

export const DEFAULT_DATE_RANGE = {
	start_date: dayjs().subtract(30, "day").format("YYYY-MM-DD"),
	end_date: dayjs().format("YYYY-MM-DD"),
	granularity: "daily" as const,
};

export function EventsPageProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const searchParams = useSearchParams();
	const {
		activeOrganization,
		activeOrganizationId,
		isLoading: isLoadingOrg,
	} = useOrganizationsContext();
	const { websites: rawWebsites, isLoading: isLoadingWebsites } =
		useWebsitesLight();
	const websites = useMemo(
		() =>
			rawWebsites.map((w) => ({
				id: String(w.id ?? ""),
				name: String(w.name ?? ""),
				domain: String(w.domain ?? ""),
			})),
		[rawWebsites]
	);
	const [websiteFilterMode, setWebsiteFilterMode] = usePersistentState(
		"events-page-website-filter-mode",
		"all"
	);
	const websiteParam = searchParams.get("website");
	const startDateParam = searchParams.get("startDate");
	const endDateParam = searchParams.get("endDate");
	const granularityParam = searchParams.get("granularity");
	const filtersParam = searchParams.get(DASHBOARD_FILTERS_QUERY_PARAM);
	const dashboardFilters = useMemo(
		() => parseDashboardFiltersParam(filtersParam) ?? [],
		[filtersParam]
	);

	useEffect(() => {
		if (!websiteParam) {
			return;
		}
		if (
			websiteParam === "all" ||
			websiteParam === "no-website" ||
			websites.some((website) => website.id === websiteParam)
		) {
			setWebsiteFilterMode(websiteParam);
		}
	}, [setWebsiteFilterMode, websiteParam, websites]);

	const isSpecificWebsite =
		websiteFilterMode !== "no-website" && websiteFilterMode !== "all";

	const dateRange = useMemo<EventsPageContextValue["dateRange"]>(
		() => ({
			start_date:
				startDateParam && dayjs(startDateParam).isValid()
					? startDateParam
					: DEFAULT_DATE_RANGE.start_date,
			end_date:
				endDateParam && dayjs(endDateParam).isValid()
					? endDateParam
					: DEFAULT_DATE_RANGE.end_date,
			granularity: granularityParam === "hourly" ? "hourly" : "daily",
		}),
		[endDateParam, granularityParam, startDateParam]
	);

	const queryOptions = useMemo(() => {
		if (isSpecificWebsite) {
			return { websiteId: websiteFilterMode };
		}
		if (activeOrganizationId) {
			return { organizationId: activeOrganizationId };
		}
		return {};
	}, [isSpecificWebsite, websiteFilterMode, activeOrganizationId]);

	const websiteFilters = useMemo<DynamicQueryFilter[]>(() => {
		if (websiteFilterMode === "no-website") {
			return [{ field: "website_id", operator: "eq", value: "" }];
		}
		return [];
	}, [websiteFilterMode]);
	const activeFilters = useMemo(
		() => [...websiteFilters, ...dashboardFilters],
		[dashboardFilters, websiteFilters]
	);

	const hasQueryId = !!(
		isSpecificWebsite ||
		activeOrganization?.id ||
		activeOrganizationId
	);

	const query = useCustomEventsData(queryOptions, dateRange, {
		filters: activeFilters,
		enabled: hasQueryId,
	});

	const selectedWebsite = isSpecificWebsite
		? websites.find((w) => w.id === websiteFilterMode)
		: undefined;

	const value = useMemo(
		() => ({
			websiteFilterMode,
			setWebsiteFilterMode,
			selectedWebsite,
			websites,
			isLoadingWebsites,
			queryOptions,
			websiteFilters: activeFilters,
			hasQueryId,
			dateRange,
			isLoadingOrg,
			query,
		}),
		[
			websiteFilterMode,
			selectedWebsite,
			websites,
			isLoadingWebsites,
			queryOptions,
			activeFilters,
			hasQueryId,
			dateRange,
			isLoadingOrg,
			query,
		]
	);

	return (
		<EventsPageContext.Provider value={value}>
			{children}
		</EventsPageContext.Provider>
	);
}

export function useEventsPageContext() {
	const context = useContext(EventsPageContext);
	if (!context) {
		throw new Error(
			"useEventsPageContext must be used within EventsPageProvider"
		);
	}
	return context;
}
