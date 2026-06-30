import { publicConfig } from "@databuddy/env/public";
import type { DateRange } from "@/types/analytics";
import type {
	DynamicQueryFilter,
	DynamicQueryRequest,
	ParameterWithDates,
} from "@/types/api";
import type {
	CustomQueryConfig,
	CustomQueryRequest,
} from "../types/custom-query";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { resolveDateRange } from "../utils/date-presets";
import { formatWidgetValue, parseNumericValue } from "../utils/formatters";
import type {
	CardFilter,
	DashboardWidgetBase,
	DataSourceMode,
	DateRangePreset,
	QueryCell,
	QueryRow,
} from "../utils/types";

interface UseDashboardDataOptions {
	enabled?: boolean;
}

interface ChartDataPoint {
	date: string;
	value: number;
}

interface DashboardDataResult {
	getChartData: (
		cardId: string,
		queryType: string,
		field: string
	) => ChartDataPoint[];
	getRawValue: (
		cardId: string,
		queryType: string,
		field: string
	) => QueryCell | undefined;
	getRow: (cardId: string, queryType: string) => QueryRow | undefined;
	getRows: (cardId: string, queryType: string) => QueryRow[];
	getValue: (cardId: string, queryType: string, field: string) => string;
	hasData: (cardId: string, queryType: string) => boolean;
	isFetching: boolean;
	isLoading: boolean;
}

interface WidgetWithSettings extends DashboardWidgetBase {
	customQuery?: CustomQueryConfig;
	dataSourceMode?: DataSourceMode;
	dateRangePreset?: DateRangePreset;
	filters?: CardFilter[];
}

type CardQueryMap = Map<string, { queryId: string; paramId: string }>;
type QueryDataGetter = (queryId: string, paramId: string) => QueryRow[];

const API_BASE_URL = publicConfig.urls.api;

function toQueryFilters(filters?: CardFilter[]): DynamicQueryFilter[] {
	if (!filters || filters.length === 0) {
		return [];
	}
	return filters
		.filter((f) => f.value.trim() !== "")
		.map((f) => ({
			field: f.field,
			operator: f.operator,
			value: f.value,
		}));
}

function createFilterKey(filters?: CardFilter[]): string {
	if (!filters?.length) {
		return "";
	}
	return JSON.stringify(
		filters.map((f) => `${f.field}:${f.operator}:${f.value}`).sort()
	);
}

async function fetchCustomQuery(
	websiteId: string,
	request: CustomQueryRequest
): Promise<Record<string, unknown>[]> {
	const response = await fetch(
		`${API_BASE_URL}/v1/query/custom?website_id=${websiteId}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify(request),
		}
	);
	const data = await response.json();
	if (!data.success) {
		throw new Error(data.error || "Custom query failed");
	}
	return data.data || [];
}

function getPredefinedRows(
	cardId: string,
	queryType: string,
	cardToQueryMap: CardQueryMap,
	getDataForQuery: QueryDataGetter
): QueryRow[] {
	const mapping = cardToQueryMap.get(cardId);
	if (!mapping) {
		return [];
	}

	const rowsByParam = getDataForQuery(mapping.queryId, mapping.paramId);
	if (Array.isArray(rowsByParam) && rowsByParam.length > 0) {
		return rowsByParam;
	}

	const rowsByType = getDataForQuery(mapping.queryId, queryType);
	return Array.isArray(rowsByType) ? rowsByType : [];
}

function createDashboardDataAccessors(
	customDataMap: Map<string, Record<string, unknown>[]>,
	cardToQueryMap: CardQueryMap,
	getDataForQuery: QueryDataGetter
): Omit<DashboardDataResult, "isFetching" | "isLoading"> {
	const getRows = (cardId: string, queryType: string): QueryRow[] => {
		const customData = customDataMap.get(cardId);
		return customData
			? (customData as QueryRow[])
			: getPredefinedRows(cardId, queryType, cardToQueryMap, getDataForQuery);
	};

	const getRow = (cardId: string, queryType: string) =>
		getRows(cardId, queryType).at(0);

	return {
		getRows,
		getRow,
		getRawValue: (cardId, queryType, field) => {
			const customData = customDataMap.get(cardId);
			if (customData) {
				return Object.values(customData.at(0) || {}).at(0) as
					| QueryCell
					| undefined;
			}
			return getRow(cardId, queryType)?.[field];
		},
		getValue: (cardId, queryType, field) => {
			const value = customDataMap.has(cardId)
				? (Object.values(customDataMap.get(cardId)?.at(0) || {}).at(0) as
						| QueryCell
						| undefined)
				: getRow(cardId, queryType)?.[field];
			return value === undefined || value === null
				? "—"
				: formatWidgetValue(value, field);
		},
		getChartData: (cardId, queryType, field) =>
			getRows(cardId, queryType)
				.map((row) => ({
					date: row.date ? String(row.date) : "",
					value: parseNumericValue(row[field]),
				}))
				.filter((point) => point.date),
		hasData: (cardId, queryType) => getRows(cardId, queryType).length > 0,
	};
}

export function useDashboardData<T extends WidgetWithSettings>(
	websiteId: string,
	globalDateRange: DateRange,
	widgets: T[],
	options?: UseDashboardDataOptions
): DashboardDataResult {
	const { predefinedWidgets, customWidgets } = useMemo(() => {
		const predefined: T[] = [];
		const custom: T[] = [];

		for (const widget of widgets) {
			if (widget.dataSourceMode === "custom" && widget.customQuery) {
				custom.push(widget);
			} else {
				predefined.push(widget);
			}
		}

		return { predefinedWidgets: predefined, customWidgets: custom };
	}, [widgets]);

	const { queries, cardToQueryMap } = useMemo(() => {
		const filterGroups = new Map<
			string,
			{
				filters?: DynamicQueryFilter[];
				parameters: Map<string, ParameterWithDates>;
				cardIds: string[];
			}
		>();

		for (const widget of predefinedWidgets) {
			const filterKey = createFilterKey(widget.filters);
			const resolvedDateRange = resolveDateRange(
				widget.dateRangePreset || "global",
				globalDateRange
			);

			if (!filterGroups.has(filterKey)) {
				filterGroups.set(filterKey, {
					filters:
						widget.filters && widget.filters.length > 0
							? toQueryFilters(widget.filters)
							: undefined,
					parameters: new Map(),
					cardIds: [],
				});
			}

			const group = filterGroups.get(filterKey);
			if (!group) {
				continue;
			}
			group.cardIds.push(widget.id);

			const paramKey = `${widget.queryType}|${resolvedDateRange.start_date}|${resolvedDateRange.end_date}`;

			if (!group.parameters.has(paramKey)) {
				group.parameters.set(paramKey, {
					name: widget.queryType,
					id: paramKey,
					start_date: resolvedDateRange.start_date,
					end_date: resolvedDateRange.end_date,
					granularity: resolvedDateRange.granularity,
				});
			}
		}

		const batchQueries: DynamicQueryRequest[] = [];
		const cardMap = new Map<string, { queryId: string; paramId: string }>();

		let queryIndex = 0;
		for (const [, group] of filterGroups) {
			const queryId = `query-${queryIndex++}`;

			batchQueries.push({
				id: queryId,
				parameters: [...group.parameters.values()],
				filters: group.filters,
				granularity: globalDateRange.granularity,
			});

			for (const cardId of group.cardIds) {
				const widget = predefinedWidgets.find((w) => w.id === cardId);
				if (widget) {
					const resolvedDateRange = resolveDateRange(
						widget.dateRangePreset || "global",
						globalDateRange
					);
					const paramId = `${widget.queryType}|${resolvedDateRange.start_date}|${resolvedDateRange.end_date}`;
					cardMap.set(cardId, { queryId, paramId });
				}
			}
		}

		return { queries: batchQueries, cardToQueryMap: cardMap };
	}, [predefinedWidgets, globalDateRange]);

	const {
		getDataForQuery,
		isLoading: predefinedLoading,
		isFetching: predefinedFetching,
	} = useBatchDynamicQuery(websiteId, globalDateRange, queries, {
		enabled: (options?.enabled ?? true) && queries.length > 0,
	});

	const customQueryConfigs = useMemo(
		() =>
			customWidgets
				.filter((widget) => widget.customQuery)
				.map((widget) => {
					const resolvedDateRange = resolveDateRange(
						widget.dateRangePreset || "global",
						globalDateRange
					);
					return {
						cardId: widget.id,
						request: {
							query: widget.customQuery,
							startDate: resolvedDateRange.start_date,
							endDate: resolvedDateRange.end_date,
							timezone: resolvedDateRange.timezone,
							granularity: resolvedDateRange.granularity,
						} as CustomQueryRequest,
					};
				}),
		[customWidgets, globalDateRange]
	);

	const customQueries = useQueries({
		queries: customQueryConfigs.map((config) => ({
			queryKey: ["custom-query", websiteId, config.cardId, config.request],
			queryFn: () => fetchCustomQuery(websiteId, config.request),
			enabled: options?.enabled ?? true,
			staleTime: 2 * 60 * 1000,
		})),
	});

	const customDataMap = useMemo(() => {
		const dataMap = new Map<string, Record<string, unknown>[]>();
		for (let i = 0; i < customQueryConfigs.length; i++) {
			const config = customQueryConfigs.at(i);
			const query = customQueries.at(i);
			if (config && query?.data) {
				dataMap.set(config.cardId, query.data);
			}
		}
		return dataMap;
	}, [customQueryConfigs, customQueries]);

	const customLoading = customQueries.some((q) => q.isLoading);
	const customFetching = customQueries.some((q) => q.isFetching);

	const isLoading = predefinedLoading || customLoading;
	const isFetching = predefinedFetching || customFetching;

	const dataAccessors = useMemo(
		() =>
			createDashboardDataAccessors(
				customDataMap,
				cardToQueryMap,
				getDataForQuery
			),
		[getDataForQuery, cardToQueryMap, customDataMap]
	);

	return {
		isLoading,
		isFetching,
		...dataAccessors,
	};
}
