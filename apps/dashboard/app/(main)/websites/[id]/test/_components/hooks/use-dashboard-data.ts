import type { DateRange } from "@databuddy/shared/types/analytics";
import type {
	DynamicQueryFilter,
	DynamicQueryRequest,
	ParameterWithDates,
} from "@databuddy/shared/types/api";
import type {
	CustomQueryConfig,
	CustomQueryRequest,
} from "@databuddy/shared/types/custom-query";
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

	const getValue = useMemo(
		() =>
			(cardId: string, queryType: string, field: string): string => {
				const customData = customDataMap.get(cardId);
				if (customData) {
					const firstRow = customData.at(0);
					if (!firstRow) {
						return "—";
					}
					const values = Object.values(firstRow);
					const firstValue = values.at(0) as QueryCell | undefined;
					if (firstValue !== undefined && firstValue !== null) {
						return formatWidgetValue(firstValue, field);
					}
					return "—";
				}

				const mapping = cardToQueryMap.get(cardId);
				if (!mapping) {
					return "—";
				}

				let rows = getDataForQuery(mapping.queryId, mapping.paramId);
				if (!Array.isArray(rows) || rows.length === 0) {
					rows = getDataForQuery(mapping.queryId, queryType);
				}

				if (!Array.isArray(rows) || rows.length === 0) {
					return "—";
				}

				const firstRow = rows.at(0);
				if (!firstRow) {
					return "—";
				}

				return formatWidgetValue(firstRow[field], field);
			},
		[getDataForQuery, cardToQueryMap, customDataMap]
	);

	const getRawValue = useMemo(
		() =>
			(
				cardId: string,
				queryType: string,
				field: string
			): QueryCell | undefined => {
				const customData = customDataMap.get(cardId);
				if (customData) {
					const firstRow = customData.at(0);
					const values = Object.values(firstRow || {});
					return values.at(0) as QueryCell | undefined;
				}

				const mapping = cardToQueryMap.get(cardId);
				if (!mapping) {
					return;
				}

				let rows = getDataForQuery(mapping.queryId, mapping.paramId);
				if (!Array.isArray(rows) || rows.length === 0) {
					rows = getDataForQuery(mapping.queryId, queryType);
				}

				if (!Array.isArray(rows) || rows.length === 0) {
					return;
				}

				const firstRow = rows.at(0);
				return firstRow?.[field];
			},
		[getDataForQuery, cardToQueryMap, customDataMap]
	);

	const getRow = useMemo(
		() =>
			(cardId: string, queryType: string): QueryRow | undefined => {
				const customData = customDataMap.get(cardId);
				if (customData) {
					return customData.at(0) as QueryRow | undefined;
				}

				const mapping = cardToQueryMap.get(cardId);
				if (!mapping) {
					return;
				}

				let rows = getDataForQuery(mapping.queryId, mapping.paramId);
				if (!Array.isArray(rows) || rows.length === 0) {
					rows = getDataForQuery(mapping.queryId, queryType);
				}

				if (!Array.isArray(rows) || rows.length === 0) {
					return;
				}
				return rows.at(0);
			},
		[getDataForQuery, cardToQueryMap, customDataMap]
	);

	const getRows = useMemo(
		() =>
			(cardId: string, queryType: string): QueryRow[] => {
				const customData = customDataMap.get(cardId);
				if (customData) {
					return customData as QueryRow[];
				}

				const mapping = cardToQueryMap.get(cardId);
				if (!mapping) {
					return [];
				}

				let rows = getDataForQuery(mapping.queryId, mapping.paramId);
				if (!Array.isArray(rows) || rows.length === 0) {
					rows = getDataForQuery(mapping.queryId, queryType);
				}

				if (!Array.isArray(rows)) {
					return [];
				}
				return rows;
			},
		[getDataForQuery, cardToQueryMap, customDataMap]
	);

	const getChartData = useMemo(
		() =>
			(cardId: string, queryType: string, field: string): ChartDataPoint[] => {
				const customData = customDataMap.get(cardId);
				if (customData) {
					return customData
						.map((row) => {
							const rawDate = row.date;
							const rawValue = (row[field] ?? Object.values(row).at(0)) as
								| QueryCell
								| undefined;
							return {
								date: rawDate ? String(rawDate) : "",
								value: parseNumericValue(rawValue),
							};
						})
						.filter((d) => d.date);
				}

				const mapping = cardToQueryMap.get(cardId);
				if (!mapping) {
					return [];
				}

				let rows = getDataForQuery(mapping.queryId, mapping.paramId);
				if (!Array.isArray(rows) || rows.length === 0) {
					rows = getDataForQuery(mapping.queryId, queryType);
				}

				if (!Array.isArray(rows)) {
					return [];
				}

				return rows
					.map((row) => {
						const rawDate = row.date;
						const rawValue = row[field];
						return {
							date: rawDate ? String(rawDate) : "",
							value: parseNumericValue(rawValue),
						};
					})
					.filter((d) => d.date);
			},
		[getDataForQuery, cardToQueryMap, customDataMap]
	);

	const hasData = useMemo(
		() =>
			(cardId: string, queryType: string): boolean => {
				const customData = customDataMap.get(cardId);
				if (customData) {
					return customData.length > 0;
				}

				const mapping = cardToQueryMap.get(cardId);
				if (!mapping) {
					return false;
				}

				let rows = getDataForQuery(mapping.queryId, mapping.paramId);
				if (!Array.isArray(rows) || rows.length === 0) {
					rows = getDataForQuery(mapping.queryId, queryType);
				}

				return Array.isArray(rows) && rows.length > 0;
			},
		[getDataForQuery, cardToQueryMap, customDataMap]
	);

	return {
		isLoading,
		isFetching,
		getValue,
		getRawValue,
		getRow,
		getRows,
		getChartData,
		hasData,
	};
}
