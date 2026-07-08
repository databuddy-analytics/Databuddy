"use client";

import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { dayjs } from "@databuddy/ui";
import { orpc } from "@/lib/orpc";
import type { Link, LinkFolder } from "@databuddy/db/schema";
import type { DateRange } from "@/types/analytics";
import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

export type { Link, LinkFolder } from "@databuddy/db/schema";

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

export type LinkSortOption = "newest" | "oldest" | "name-asc" | "name-desc";
export type LinkTypeFilter = "all" | "short" | "deep";

export const LINKS_PAGE_SIZE = 50;

export interface LinksPageParams {
	folderId?: string | null;
	organizationId?: string;
	search?: string;
	sort?: LinkSortOption;
	type?: LinkTypeFilter;
}

interface LinksPage {
	hasMore: boolean;
	items: Link[];
}

const linksPaginatedRootKey = orpc.links.paginated.key();
const foldersRootKey = orpc.linkFolders.list.key();

const foldersListKey = () => orpc.linkFolders.list.queryKey({ input: {} });

const linkKey = (id: string) => orpc.links.get.queryKey({ input: { id } });

export function useLinksPaginated(params: LinksPageParams) {
	const search = params.search?.trim() || undefined;
	const sort = params.sort ?? "newest";
	const type = params.type ?? "all";
	const folderId = params.folderId;

	const query = useInfiniteQuery({
		queryKey: [
			...linksPaginatedRootKey,
			{ folderId, organizationId: params.organizationId, search, sort, type },
		] as const,
		queryFn: ({ pageParam }) =>
			orpc.links.paginated.call({
				organizationId: params.organizationId,
				folderId: folderId === undefined ? undefined : folderId,
				search,
				sort,
				type,
				limit: LINKS_PAGE_SIZE,
				offset: pageParam,
			}) as Promise<LinksPage>,
		initialPageParam: 0,
		getNextPageParam: (lastPage, _allPages, lastPageParam) =>
			lastPage.hasMore ? lastPageParam + LINKS_PAGE_SIZE : undefined,
	});

	const links = useMemo(
		() => query.data?.pages.flatMap((page) => page.items) ?? EMPTY_LINKS,
		[query.data]
	);

	return {
		links,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: query.isError,
		refetch: query.refetch,
		fetchNextPage: query.fetchNextPage,
		hasNextPage: query.hasNextPage,
		isFetchingNextPage: query.isFetchingNextPage,
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

interface InfiniteLinksData {
	pageParams: unknown[];
	pages: LinksPage[];
}

function patchPaginatedLinks(
	queryClient: ReturnType<typeof useQueryClient>,
	patch: (items: Link[]) => Link[]
) {
	queryClient.setQueriesData<InfiniteLinksData>(
		{ queryKey: linksPaginatedRootKey },
		(old) =>
			old
				? {
						...old,
						pages: old.pages.map((page) => ({
							...page,
							items: patch(page.items),
						})),
					}
				: old
	);
}

export function useCreateLink() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.links.create.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: linksPaginatedRootKey });
		},
	});
}

export function useUpdateLink() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.links.update.mutationOptions(),
		onSuccess: (updatedLink: Link) => {
			queryClient.setQueryData<Link>(linkKey(updatedLink.id), updatedLink);
			patchPaginatedLinks(queryClient, (items) =>
				items.map((link) => (link.id === updatedLink.id ? updatedLink : link))
			);
			queryClient.invalidateQueries({ queryKey: linksPaginatedRootKey });
		},
	});
}

export function useDeleteLink() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.links.delete.mutationOptions(),
		onMutate: async ({ id }) => {
			await queryClient.cancelQueries({ queryKey: linksPaginatedRootKey });
			const previousPaginated = queryClient.getQueriesData<InfiniteLinksData>({
				queryKey: linksPaginatedRootKey,
			});

			patchPaginatedLinks(queryClient, (items) =>
				items.filter((link) => link.id !== id)
			);

			return { previousPaginated };
		},
		onError: (_error, _variables, context) => {
			for (const [key, data] of context?.previousPaginated ?? []) {
				queryClient.setQueryData(key, data);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: linksPaginatedRootKey });
		},
	});
}

export function useCreateLinkFolder() {
	const queryClient = useQueryClient();

	return useMutation({
		...orpc.linkFolders.create.mutationOptions(),
		onSuccess: (newFolder: LinkFolder) => {
			queryClient.setQueryData<LinkFolder[]>(foldersListKey(), (old) => {
				if (!old) {
					return [newFolder];
				}
				if (old.some((folder) => folder.id === newFolder.id)) {
					return old;
				}
				return [...old, newFolder].sort((a, b) => a.name.localeCompare(b.name));
			});
			queryClient.invalidateQueries({
				queryKey: foldersRootKey,
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
				queryKey: foldersRootKey,
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
				queryKey: foldersRootKey,
			});
			queryClient.invalidateQueries({ queryKey: linksPaginatedRootKey });
		},
	});
}
