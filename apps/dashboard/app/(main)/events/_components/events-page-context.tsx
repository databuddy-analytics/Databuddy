"use client";

import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import { createContext, useContext, useMemo } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWebsitesLight } from "@/hooks/use-websites";
import dayjs from "@/lib/dayjs";
import { useGlobalCustomEventsData } from "./use-global-custom-events";

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
	query: ReturnType<typeof useGlobalCustomEventsData>;
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

	const isSpecificWebsite =
		websiteFilterMode !== "no-website" && websiteFilterMode !== "all";

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

	const hasQueryId = !!(
		isSpecificWebsite ||
		activeOrganization?.id ||
		activeOrganizationId
	);

	const query = useGlobalCustomEventsData(
		queryOptions,
		DEFAULT_DATE_RANGE,
		websiteFilters,
		{ enabled: hasQueryId }
	);

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
			websiteFilters,
			hasQueryId,
			dateRange: DEFAULT_DATE_RANGE,
			isLoadingOrg,
			query,
		}),
		[
			websiteFilterMode,
			selectedWebsite,
			websites,
			isLoadingWebsites,
			queryOptions,
			websiteFilters,
			hasQueryId,
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
