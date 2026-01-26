"use client";

import type { InferSelectModel, links } from "@databuddy/db";
import type { DateRange } from "@databuddy/shared/types/analytics";
import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { orpc } from "@/lib/orpc";

export type Link = InferSelectModel<typeof links>;

interface GeoEntry {
	name: string;
	country_code: string;
	country_name: string;
	clicks: number;
	percentage: number;
}

interface ReferrerEntry {
	name: string;
	referrer: string;
	clicks: number;
	percentage: number;
	domain?: string;
}

interface TimeSeriesEntry {
	date: string;
	value: number;
}

interface DeviceEntry {
	name: string;
	clicks: number;
	percentage: number;
}

export interface LinkStats {
	totalClicks: number;
	clicksByDay: Array<{ date: string; clicks: number }>;
	referrersByDay: TimeSeriesEntry[];
	countriesByDay: TimeSeriesEntry[];
	topReferrers: ReferrerEntry[];
	topCountries: GeoEntry[];
	topRegions: GeoEntry[];
	topCities: GeoEntry[];
	topDevices: DeviceEntry[];
}

export const getLinksListKey = (organizationId?: string): QueryKey =>
	orpc.links.list.queryKey({
		input: { organizationId: organizationId ?? "" },
	});

export const getLinkByIdKey = (id: string, organizationId: string): QueryKey =>
	orpc.links.get.queryKey({ input: { id, organizationId } });

const addLinkToList = (old: Link[] | undefined, newLink: Link): Link[] => {
	if (!old) {
		return [newLink];
	}
	if (old.some((l) => l.id === newLink.id)) {
		return old;
	}
	return [newLink, ...old];
};

const updateLinkInList = (
	old: Link[] | undefined,
	updatedLink: Link
): Link[] | undefined => {
	if (!old) {
		return old;
	}
	return old.map((link) => (link.id === updatedLink.id ? updatedLink : link));
};

const removeLinkFromList = (
	old: Link[] | undefined,
	linkId: string
): Link[] | undefined => {
	if (!old) {
		return old;
	}
	return old.filter((l) => l.id !== linkId);
};

export function useLinks(options?: { enabled?: boolean }) {
	const { activeOrganization, isLoading: isLoadingOrganization } =
		useOrganizationsContext();

	const query = useQuery({
		...orpc.links.list.queryOptions({
			input: { organizationId: activeOrganization?.id ?? "" },
		}),
		enabled:
			options?.enabled !== false &&
			!isLoadingOrganization &&
			!!activeOrganization?.id,
	});

	return {
		links: query.data ?? [],
		isLoading: query.isLoading || isLoadingOrganization,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
	};
}

export function useLink(id: string, organizationId: string) {
	return useQuery({
		...orpc.links.get.queryOptions({
			input: { id, organizationId },
		}),
		enabled: !!id && !!organizationId,
	});
}

function addPercentages<T extends { clicks: number }>(
	data: T[]
): (T & { percentage: number })[] {
	const total = data.reduce((sum, item) => sum + item.clicks, 0);
	return data.map((item) => ({
		...item,
		percentage: total > 0 ? (item.clicks / total) * 100 : 0,
	}));
}

export function useLinkStats(linkId: string, dateRange: DateRange) {
	const queries = useMemo(
		() => [
			{
				id: "link-stats",
				parameters: [
					"link_total_clicks",
					"link_clicks_by_day",
					"link_referrers_by_day",
					"link_countries_by_day",
					"link_top_referrers",
					"link_top_countries",
					"link_top_regions",
					"link_top_cities",
					"link_top_devices",
				],
				limit: 100,
				granularity: dateRange.granularity,
			},
		],
		[dateRange.granularity]
	);

	const { isLoading, error, getDataForQuery, refetch } = useBatchDynamicQuery(
		{ linkId },
		dateRange,
		queries,
		{ enabled: !!linkId }
	);

	const stats = useMemo<LinkStats>(() => {
		const totalClicksData = getDataForQuery("link-stats", "link_total_clicks");
		const clicksByDayData = getDataForQuery("link-stats", "link_clicks_by_day");
		const referrersByDayData = getDataForQuery(
			"link-stats",
			"link_referrers_by_day"
		) as TimeSeriesEntry[];
		const countriesByDayData = getDataForQuery(
			"link-stats",
			"link_countries_by_day"
		) as TimeSeriesEntry[];
		const topReferrersData = getDataForQuery(
			"link-stats",
			"link_top_referrers"
		) as Array<{ name: string; referrer: string; clicks: number }>;
		const topCountriesData = getDataForQuery(
			"link-stats",
			"link_top_countries"
		) as Array<{
			name: string;
			country_code: string;
			country_name: string;
			clicks: number;
		}>;
		const topRegionsData = getDataForQuery(
			"link-stats",
			"link_top_regions"
		) as Array<{
			name: string;
			country_code: string;
			country_name: string;
			clicks: number;
		}>;
		const topCitiesData = getDataForQuery(
			"link-stats",
			"link_top_cities"
		) as Array<{
			name: string;
			country_code: string;
			country_name: string;
			clicks: number;
		}>;
		const topDevicesData = getDataForQuery(
			"link-stats",
			"link_top_devices"
		) as Array<{ name: string; clicks: number }>;

		return {
			totalClicks: (totalClicksData[0] as { total?: number })?.total ?? 0,
			clicksByDay: clicksByDayData as Array<{ date: string; clicks: number }>,
			referrersByDay: referrersByDayData ?? [],
			countriesByDay: countriesByDayData ?? [],
			topReferrers: addPercentages(topReferrersData),
			topCountries: addPercentages(topCountriesData),
			topRegions: addPercentages(topRegionsData),
			topCities: addPercentages(topCitiesData),
			topDevices: addPercentages(topDevicesData ?? []),
		};
	}, [getDataForQuery]);

	return {
		data: stats,
		isLoading,
		error,
		refetch,
	};
}

export function useCreateLink() {
	const queryClient = useQueryClient();
	const { activeOrganization } = useOrganizationsContext();

	return useMutation({
		...orpc.links.create.mutationOptions(),
		onSuccess: (newLink: Link) => {
			const listKey = getLinksListKey(activeOrganization?.id);
			queryClient.setQueryData<Link[]>(listKey, (old) =>
				addLinkToList(old, newLink)
			);
		},
	});
}

export function useUpdateLink() {
	const queryClient = useQueryClient();
	const { activeOrganization } = useOrganizationsContext();

	return useMutation({
		...orpc.links.update.mutationOptions(),
		onSuccess: (updatedLink: Link) => {
			const listKey = getLinksListKey(activeOrganization?.id);
			queryClient.setQueryData<Link[]>(listKey, (old) =>
				updateLinkInList(old, updatedLink)
			);

			if (activeOrganization?.id) {
				const getByIdKey = getLinkByIdKey(
					updatedLink.id,
					activeOrganization.id
				);
				queryClient.setQueryData(getByIdKey, updatedLink);
			}
		},
	});
}

export function useDeleteLink() {
	const queryClient = useQueryClient();
	const { activeOrganization } = useOrganizationsContext();

	return useMutation({
		...orpc.links.delete.mutationOptions(),
		onMutate: async ({ id }) => {
			const listKey = getLinksListKey(activeOrganization?.id);
			await queryClient.cancelQueries({ queryKey: listKey });
			const previousData = queryClient.getQueryData<Link[]>(listKey);

			queryClient.setQueryData<Link[]>(listKey, (old) =>
				removeLinkFromList(old, id)
			);

			return { previousData, listKey };
		},
		onError: (_error, _variables, context) => {
			if (context?.previousData && context.listKey) {
				queryClient.setQueryData(context.listKey, context.previousData);
			}
		},
	});
}
