"use client";

import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { dayjs } from "@databuddy/ui";
import { orpc } from "@/lib/orpc";
import type { Link, LinkFolder } from "@databuddy/db/schema";
import type { DateRange } from "@/types/analytics";
import type { QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

export type { Link, LinkFolder } from "@databuddy/db/schema";

export interface LinkListInput {
	externalId?: string;
	folderId?: string | null;
	organizationId?: string;
	sourceId?: string;
	sourceOwnerId?: string;
	sourceType?: string;
	targetDomain?: string;
}

interface GeoEntry {
	clicks: number;
	country_code: string;
	country_name: string;
	name: string;
	percentage: number;
}

interface ReferrerEntry {
	clicks: number;
	domain?: string;
	name: string;
	percentage: number;
	referrer: string;
	referrer_type?: string;
	source?: string;
}

interface TimeSeriesEntry {
	date: string;
	value: number;
}

interface DeviceEntry {
	clicks: number;
	name: string;
	percentage: number;
}

export interface LinkStats {
	clicksByDay: Array<{ date: string; clicks: number }>;
	countriesByDay: TimeSeriesEntry[];
	referrersByDay: TimeSeriesEntry[];
	topCities: GeoEntry[];
	topCountries: GeoEntry[];
	topDevices: DeviceEntry[];
	topReferrers: ReferrerEntry[];
	topRegions: GeoEntry[];
	totalClicks: number;
}

const EMPTY_LINKS: Link[] = [];
const EMPTY_LINK_FOLDERS: LinkFolder[] = [];

export const getLinksListKey = (input: LinkListInput = {}): QueryKey =>
	orpc.links.list.queryKey({ input });

export const getLinkFoldersListKey = (): QueryKey =>
	orpc.linkFolders.list.queryKey({ input: {} });

export const getLinkByIdKey = (id: string): QueryKey =>
	orpc.links.get.queryKey({ input: { id } });

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

const addFolderToList = (
	old: LinkFolder[] | undefined,
	newFolder: LinkFolder
): LinkFolder[] => {
	if (!old) {
		return [newFolder];
	}
	if (old.some((folder) => folder.id === newFolder.id)) {
		return old;
	}
	return [...old, newFolder].sort((a, b) => a.name.localeCompare(b.name));
};

export function useLinks(options?: {
	enabled?: boolean;
	input?: LinkListInput;
}) {
	const query = useQuery({
		...orpc.links.list.queryOptions({
			input: options?.input ?? {},
		}),
		enabled: options?.enabled !== false,
	});

	return {
		links: query.data ?? EMPTY_LINKS,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
	};
}

export function useLinkFolders(options?: { enabled?: boolean }) {
	const query = useQuery({
		...orpc.linkFolders.list.queryOptions({
			input: {},
		}),
		enabled: options?.enabled !== false,
	});

	return {
		folders: query.data ?? EMPTY_LINK_FOLDERS,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
	};
}

export function useLink(id: string) {
	return useQuery({
		...orpc.links.get.queryOptions({
			input: { id },
		}),
		enabled: !!id,
	});
}

function fillEmptyDays<T extends { date: string }>(
	data: T[],
	startDate: string,
	endDate: string,
	defaults: Omit<T, "date">
): T[] {
	const dataMap = new Map(
		data.map((d) => [dayjs(d.date).format("YYYY-MM-DD"), d])
	);
	const filled: T[] = [];
	let current = dayjs(startDate);
	const end = dayjs(endDate);
	while (current.isBefore(end) || current.isSame(end, "day")) {
		const key = current.format("YYYY-MM-DD");
		filled.push(dataMap.get(key) ?? ({ ...defaults, date: key } as T));
		current = current.add(1, "day");
	}
	return filled;
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
		) as Array<{
			name: string;
			referrer: string;
			domain?: string;
			referrer_type?: string;
			source?: string;
			clicks: number;
		}>;
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
			clicksByDay: fillEmptyDays(
				(clicksByDayData ?? []) as Array<{ date: string; clicks: number }>,
				dateRange.start_date,
				dateRange.end_date,
				{ clicks: 0 }
			),
			referrersByDay: fillEmptyDays(
				(referrersByDayData ?? []) as TimeSeriesEntry[],
				dateRange.start_date,
				dateRange.end_date,
				{ value: 0 }
			),
			countriesByDay: fillEmptyDays(
				(countriesByDayData ?? []) as TimeSeriesEntry[],
				dateRange.start_date,
				dateRange.end_date,
				{ value: 0 }
			),
			topReferrers: addPercentages(topReferrersData),
			topCountries: addPercentages(topCountriesData),
			topRegions: addPercentages(topRegionsData),
			topCities: addPercentages(topCitiesData),
			topDevices: addPercentages(topDevicesData ?? []),
		};
	}, [getDataForQuery, dateRange.start_date, dateRange.end_date]);

	return {
		data: stats,
		isLoading,
		error,
		refetch,
	};
}

export function useCreateLink() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.links.create.mutationOptions(),
		onSuccess: (newLink: Link) => {
			const listKey = getLinksListKey();
			queryClient.setQueryData<Link[]>(listKey, (old) =>
				addLinkToList(old, newLink)
			);
			queryClient.invalidateQueries({ queryKey: orpc.links.list.key() });
		},
	});
}

export function useUpdateLink() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.links.update.mutationOptions(),
		onSuccess: (updatedLink: Link) => {
			const listKey = getLinksListKey();
			queryClient.setQueryData<Link[]>(listKey, (old) =>
				updateLinkInList(old, updatedLink)
			);

			queryClient.setQueryData(getLinkByIdKey(updatedLink.id), updatedLink);
			queryClient.invalidateQueries({ queryKey: orpc.links.list.key() });
		},
	});
}

export function useDeleteLink() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.links.delete.mutationOptions(),
		onMutate: async ({ id }) => {
			const listKey = getLinksListKey();
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
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: orpc.links.list.key() });
		},
	});
}

export function useCreateLinkFolder() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.linkFolders.create.mutationOptions(),
		onSuccess: (newFolder: LinkFolder) => {
			queryClient.setQueryData<LinkFolder[]>(getLinkFoldersListKey(), (old) =>
				addFolderToList(old, newFolder)
			);
			queryClient.invalidateQueries({
				queryKey: orpc.linkFolders.list.key(),
			});
		},
	});
}

export function useUpdateLinkFolder() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.linkFolders.update.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.linkFolders.list.key(),
			});
		},
	});
}

export function useDeleteLinkFolder() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.linkFolders.delete.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.linkFolders.list.key(),
			});
			queryClient.invalidateQueries({ queryKey: orpc.links.list.key() });
		},
	});
}
