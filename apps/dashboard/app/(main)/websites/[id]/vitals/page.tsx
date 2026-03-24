"use client";

import { HeartbeatIcon } from "@phosphor-icons/react/dist/ssr/Heartbeat";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { RESGaugeCard } from "@/components/analytics/res-gauge-card";
import {
	type TrendData,
	VITAL_CONFIGS,
	VitalGaugeCard,
} from "@/components/analytics/vital-gauge-card";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DataTable, type TabConfig } from "@/components/table/data-table";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { usePersistentState } from "@/hooks/use-persistent-state";
import dayjs from "@/lib/dayjs";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
} from "@/stores/jotai/filterAtoms";
import {
	createBrowserColumns,
	createCityColumns,
	createCountryColumns,
	createPageColumns,
	createRegionColumns,
	type VitalsBreakdownData,
} from "./columns";

interface VitalMetric {
	metric_name: string;
	p50: number;
	p75: number;
	p90: number;
	p95: number;
	p99: number;
	avg_value: number;
	samples: number;
}

interface VitalTimeSeriesRow {
	date: string;
	metric_name: string;
	p50: number;
	p75: number;
	p90: number;
	p95: number;
	p99: number;
	samples: number;
}

interface VitalByPageRow {
	page: string;
	metric_name: string;
	p50: number;
	p75: number;
	p90: number;
	p95: number;
	p99: number;
	samples: number;
}

type VitalVisibility = Record<string, boolean>;
type PercentileKey = "p50" | "p75" | "p90" | "p95" | "p99";

const DEFAULT_VISIBILITY: VitalVisibility = {
	LCP: true,
	FCP: true,
	CLS: false,
	INP: true,
	TTFB: true,
	FPS: false,
};

const PERCENTILE_OPTIONS: {
	value: PercentileKey;
	label: string;
	description: string;
}[] = [
	{ value: "p50", label: "p50", description: "Median" },
	{ value: "p75", label: "p75", description: "Google's threshold" },
	{ value: "p90", label: "p90", description: "90th percentile" },
	{ value: "p95", label: "p95", description: "95th percentile" },
	{ value: "p99", label: "p99", description: "99th percentile" },
];

function calculatePreviousPeriod(dateRange: {
	start_date: string;
	end_date: string;
	granularity: "daily" | "hourly";
}) {
	const startDate = dayjs(dateRange.start_date);
	const daysDiff = dayjs(dateRange.end_date).diff(startDate, "day");

	return {
		start_date: startDate.subtract(daysDiff + 1, "day").format("YYYY-MM-DD"),
		end_date: startDate.subtract(1, "day").format("YYYY-MM-DD"),
		granularity: dateRange.granularity as "daily" | "hourly",
	};
}

function calculatePercentChange(current: number, previous: number): number {
	if (previous === 0) {
		return current > 0 ? 100 : 0;
	}
	return ((current - previous) / previous) * 100;
}

export default function VitalsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const { dateRange } = useDateFilters();

	const [filters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilter] = useAtom(addDynamicFilterAtom);

	const [visibleMetrics, setVisibleMetrics] =
		usePersistentState<VitalVisibility>(
			`vitals-visibility-${websiteId}`,
			DEFAULT_VISIBILITY
		);

	const [selectedPercentile, setSelectedPercentile] =
		usePersistentState<PercentileKey>(`vitals-percentile-${websiteId}`, "p75");

	// Calculate previous period for comparison
	const previousPeriodRange = useMemo(
		() => calculatePreviousPeriod(dateRange),
		[dateRange]
	);

	const queries = [
		{
			id: "vitals-overview",
			parameters: ["vitals_overview"],
			filters,
		},
		{
			id: "vitals-previous",
			parameters: [
				{
					name: "vitals_overview",
					start_date: previousPeriodRange.start_date,
					end_date: previousPeriodRange.end_date,
					granularity: previousPeriodRange.granularity,
					id: "previous_vitals_overview",
				},
			],
			filters,
		},
		{
			id: "vitals-time-series",
			parameters: ["vitals_time_series"],
			filters,
		},
		{
			id: "vitals-by-page",
			parameters: ["vitals_by_page"],
			filters,
		},
		{
			id: "vitals-by-country",
			parameters: ["vitals_by_country"],
			filters,
		},
		{
			id: "vitals-by-browser",
			parameters: ["vitals_by_browser"],
			filters,
		},
		{
			id: "vitals-by-region",
			parameters: ["vitals_by_region"],
			filters,
		},
		{
			id: "vitals-by-city",
			parameters: ["vitals_by_city"],
			filters,
		},
	];

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const overviewData =
		(getDataForQuery("vitals-overview", "vitals_overview") as VitalMetric[]) ??
		[];

	const previousOverviewData =
		(getDataForQuery(
			"vitals-previous",
			"previous_vitals_overview"
		) as VitalMetric[]) ?? [];

	const timeSeriesData =
		(getDataForQuery(
			"vitals-time-series",
			"vitals_time_series"
		) as VitalTimeSeriesRow[]) ?? [];

	const pageBreakdownData =
		(getDataForQuery("vitals-by-page", "vitals_by_page") as VitalByPageRow[]) ??
		[];

	const countryBreakdownData =
		(getDataForQuery("vitals-by-country", "vitals_by_country") as Record<
			string,
			unknown
		>[]) ?? [];

	const browserBreakdownData =
		(getDataForQuery("vitals-by-browser", "vitals_by_browser") as Record<
			string,
			unknown
		>[]) ?? [];

	const regionBreakdownData =
		(getDataForQuery("vitals-by-region", "vitals_by_region") as Record<
			string,
			unknown
		>[]) ?? [];

	const cityBreakdownData =
		(getDataForQuery("vitals-by-city", "vitals_by_city") as Record<
			string,
			unknown
		>[]) ?? [];

	// Pivot time series data from EAV to columnar format for the chart
	const chartData = useMemo(() => {
		if (!timeSeriesData.length) {
			return [];
		}

		const grouped = new Map<
			string,
			{ date: string; [key: string]: string | number }
		>();

		for (const row of timeSeriesData) {
			const dateKey = dayjs(row.date).format("MMM D");
			if (!grouped.has(dateKey)) {
				grouped.set(dateKey, { date: dateKey });
			}
			const entry = grouped.get(dateKey);
			if (entry) {
				entry[row.metric_name] = row[selectedPercentile];
			}
		}

		return Array.from(grouped.values());
	}, [timeSeriesData, selectedPercentile]);

	const chartMetrics = useMemo(
		() =>
			Object.entries(VITAL_CONFIGS)
				.filter(([key]) => visibleMetrics[key])
				.map(([key, config]) => ({
					key,
					label: config.name,
					color: config.color,
					formatValue: (v: number) =>
						config.name === "CLS"
							? v.toFixed(2)
							: `${Math.round(v)}${config.unit}`,
				})),
		[visibleMetrics]
	);

	const getMetricValue = useCallback(
		(name: string): number | null => {
			const metric = overviewData.find((m) => m.metric_name === name);
			if (!metric) {
				return null;
			}
			return metric[selectedPercentile] ?? null;
		},
		[overviewData, selectedPercentile]
	);

	const getMetricSamples = useCallback(
		(name: string): number | undefined => {
			const metric = overviewData.find((m) => m.metric_name === name);
			return metric?.samples;
		},
		[overviewData]
	);

	const getMetricTrend = useCallback(
		(name: string): TrendData | undefined => {
			const current = overviewData.find((m) => m.metric_name === name);
			const previous = previousOverviewData.find((m) => m.metric_name === name);

			if (!(current && previous)) {
				return undefined;
			}

			const currentValue = current[selectedPercentile];
			const previousValue = previous[selectedPercentile];

			if (previousValue === 0 || previousValue === undefined) {
				return undefined;
			}

			return {
				previousValue,
				change: calculatePercentChange(currentValue, previousValue),
			};
		},
		[overviewData, previousOverviewData, selectedPercentile]
	);

	const toggleMetric = useCallback(
		(metricName: string) => {
			setVisibleMetrics((prev) => ({
				...prev,
				[metricName]: !prev[metricName],
			}));
		},
		[setVisibleMetrics]
	);

	const handleAddFilter = useCallback(
		(field: string, value: string, _label?: string) => {
			addFilter({ field, operator: "eq", value });
		},
		[addFilter]
	);

	const handlePercentileChange = useCallback(
		(value: string) => {
			setSelectedPercentile(value as PercentileKey);
		},
		[setSelectedPercentile]
	);

	const pageVitalsTable = useMemo(() => {
		if (!pageBreakdownData.length) {
			return [];
		}

		const pageMap = new Map<string, VitalsBreakdownData>();

		for (const row of pageBreakdownData) {
			if (!pageMap.has(row.page)) {
				pageMap.set(row.page, {
					name: row.page,
					samples: 0,
				});
			}

			const pageData = pageMap.get(row.page);
			if (pageData) {
				pageData.samples += row.samples;
				const metricKey = row.metric_name.toLowerCase() as
					| "lcp"
					| "fcp"
					| "cls"
					| "inp"
					| "ttfb"
					| "fps";
				pageData[metricKey] = row[selectedPercentile];
			}
		}

		return Array.from(pageMap.values()).sort((a, b) => b.samples - a.samples);
	}, [pageBreakdownData, selectedPercentile]);

	const countryData = useMemo(
		(): VitalsBreakdownData[] =>
			countryBreakdownData.map((item) => ({
				name: (item.name as string) || "",
				samples: (item.samples as number) || 0,
				visitors: (item.visitors as number) || undefined,
				lcp: (item.p50_lcp as number) || undefined,
				fcp: (item.p50_fcp as number) || undefined,
				cls: (item.p50_cls as number) || undefined,
				inp: (item.p50_inp as number) || undefined,
				ttfb: (item.p50_ttfb as number) || undefined,
				country_code: (item.country_code as string) || undefined,
				country_name: (item.country_name as string) || undefined,
			})),
		[countryBreakdownData]
	);

	const browserData = useMemo(
		(): VitalsBreakdownData[] =>
			browserBreakdownData.map((item) => ({
				name: (item.name as string) || "",
				samples: (item.samples as number) || 0,
				visitors: (item.visitors as number) || undefined,
				lcp: (item.p50_lcp as number) || undefined,
				fcp: (item.p50_fcp as number) || undefined,
				cls: (item.p50_cls as number) || undefined,
				inp: (item.p50_inp as number) || undefined,
				ttfb: (item.p50_ttfb as number) || undefined,
			})),
		[browserBreakdownData]
	);

	const regionData = useMemo(
		(): VitalsBreakdownData[] =>
			regionBreakdownData.map((item) => ({
				name: (item.name as string) || "",
				samples: (item.samples as number) || 0,
				visitors: (item.visitors as number) || undefined,
				lcp: (item.p50_lcp as number) || undefined,
				fcp: (item.p50_fcp as number) || undefined,
				cls: (item.p50_cls as number) || undefined,
				inp: (item.p50_inp as number) || undefined,
				ttfb: (item.p50_ttfb as number) || undefined,
				country_code: (item.country_code as string) || undefined,
				country_name: (item.country_name as string) || undefined,
			})),
		[regionBreakdownData]
	);

	const cityData = useMemo(
		(): VitalsBreakdownData[] =>
			cityBreakdownData.map((item) => ({
				name: (item.name as string) || "",
				samples: (item.samples as number) || 0,
				visitors: (item.visitors as number) || undefined,
				lcp: (item.p50_lcp as number) || undefined,
				fcp: (item.p50_fcp as number) || undefined,
				cls: (item.p50_cls as number) || undefined,
				inp: (item.p50_inp as number) || undefined,
				ttfb: (item.p50_ttfb as number) || undefined,
				country_code: (item.country_code as string) || undefined,
				country_name: (item.country_name as string) || undefined,
			})),
		[cityBreakdownData]
	);

	const vitalsTabs = useMemo(() => {
		const tabs: TabConfig<VitalsBreakdownData>[] = [];

		if (pageVitalsTable.length > 0) {
			tabs.push({
				id: "pages",
				label: "Pages",
				data: pageVitalsTable,
				columns: createPageColumns(),
				getFilter: (row) => ({ field: "path", value: row.name }),
			});
		}

		if (countryData.length > 0) {
			tabs.push({
				id: "countries",
				label: "Countries",
				data: countryData,
				columns: createCountryColumns(),
				getFilter: (row) => ({ field: "country", value: row.name }),
			});
		}

		if (regionData.length > 0) {
			tabs.push({
				id: "regions",
				label: "Regions",
				data: regionData,
				columns: createRegionColumns(),
				getFilter: (row) => ({
					field: "region",
					value: row.name.split(",")[0]?.trim() || row.name,
				}),
			});
		}

		if (cityData.length > 0) {
			tabs.push({
				id: "cities",
				label: "Cities",
				data: cityData,
				columns: createCityColumns(),
				getFilter: (row) => ({
					field: "city",
					value: row.name.split(",")[0]?.trim() || row.name,
				}),
			});
		}

		if (browserData.length > 0) {
			tabs.push({
				id: "browsers",
				label: "Browsers",
				data: browserData,
				columns: createBrowserColumns(),
				getFilter: (row) => ({ field: "browser_name", value: row.name }),
			});
		}

		return tabs;
	}, [pageVitalsTable, countryData, regionData, cityData, browserData]);

	const vitalKeys = Object.keys(VITAL_CONFIGS) as Array<
		keyof typeof VITAL_CONFIGS
	>;

	const selectedPercentileLabel =
		PERCENTILE_OPTIONS.find((opt) => opt.value === selectedPercentile)
			?.description || selectedPercentile;

	return (
		<div className="relative flex h-full flex-col">
			<div className="space-y-4 p-4">
				{overviewData.length > 0 || isLoading ? (
					<RESGaugeCard
						isLoading={isLoading}
						metrics={overviewData}
						onPercentileChangeAction={handlePercentileChange}
						percentileOptions={PERCENTILE_OPTIONS}
						previousMetrics={previousOverviewData}
						selectedPercentile={selectedPercentile}
					/>
				) : null}

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
					{vitalKeys.map((key) => (
						<VitalGaugeCard
							isActive={visibleMetrics[key]}
							isLoading={isLoading}
							key={key}
							metricName={key}
							onToggleAction={() => toggleMetric(key)}
							samples={getMetricSamples(key)}
							trend={getMetricTrend(key)}
							value={getMetricValue(key)}
						/>
					))}
				</div>

				{chartMetrics.length > 0 ? (
					<SimpleMetricsChart
						data={chartData}
						description={`${selectedPercentileLabel} values over time`}
						height={300}
						isLoading={isLoading}
						metrics={chartMetrics}
						title="Performance Trend"
					/>
				) : (
					<div className="rounded border bg-card p-8 text-center">
						<p className="mx-auto text-muted-foreground text-sm">
							Click on a metric above to add it to the chart
						</p>
					</div>
				)}

				{vitalsTabs.length > 0 ? (
					<DataTable
						description={`Breakdown showing ${selectedPercentile} values`}
						emptyMessage="No vitals breakdown data available"
						isLoading={isLoading}
						minHeight={500}
						onAddFilter={handleAddFilter}
						tabs={vitalsTabs}
						title="Breakdown"
					/>
				) : (
					!isLoading && (
						<div className="rounded border bg-card p-8 text-center">
							<p className="mx-auto text-muted-foreground text-sm">
								No breakdown data available. Vitals breakdowns will appear here
								once data is collected.
							</p>
						</div>
					)
				)}

				{!isLoading && overviewData.length === 0 && (
					<div className="rounded border bg-card p-8 text-center">
						<HeartbeatIcon
							className="mx-auto size-12 text-muted-foreground/40"
							weight="duotone"
						/>
						<h3 className="mt-4 font-medium text-foreground">
							No Web Vitals data yet
						</h3>
						<p className="mx-auto mt-1 max-w-md text-balance text-muted-foreground text-sm">
							Web Vitals will appear here once your tracker starts collecting
							performance data from real users. Make sure{" "}
							<code className="rounded bg-muted px-1 py-0.5 text-xs">
								trackWebVitals
							</code>{" "}
							is enabled in your tracker configuration.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
