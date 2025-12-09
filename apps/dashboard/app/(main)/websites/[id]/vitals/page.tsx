"use client";

import { HeartbeatIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
	VITAL_CONFIGS,
	VitalGaugeCard,
} from "@/components/analytics/vital-gauge-card";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DataTable, type TabConfig } from "@/components/table/data-table";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import { WebsitePageHeader } from "../_components/website-page-header";
import {
	createBrowserColumns,
	createCityColumns,
	createCountryColumns,
	createDeviceColumns,
	createPageColumns,
	createRegionColumns,
	type VitalsBreakdownData,
} from "./columns";

type VitalMetric = {
	metric_name: string;
	p50: number;
	p75: number;
	p90: number;
	p95: number;
	p99: number;
	avg_value: number;
	samples: number;
};

type VitalTimeSeriesRow = {
	date: string;
	metric_name: string;
	p50: number;
	p75: number;
	p90: number;
	p95: number;
	p99: number;
	samples: number;
};

type VitalByPageRow = {
	page: string;
	metric_name: string;
	p50: number;
	p75: number;
	p90: number;
	samples: number;
};

type VitalVisibility = Record<string, boolean>;

const DEFAULT_VISIBILITY: VitalVisibility = {
	LCP: true,
	FCP: true,
	CLS: false,
	INP: true,
	TTFB: true,
	FPS: false,
};

export default function VitalsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const { dateRange } = useDateFilters();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);

	const [visibleMetrics, setVisibleMetrics] =
		usePersistentState<VitalVisibility>(
			`vitals-visibility-${websiteId}`,
			DEFAULT_VISIBILITY
		);

	const queries = [
		{
			id: "vitals-overview",
			parameters: ["vitals_overview"],
		},
		{
			id: "vitals-time-series",
			parameters: ["vitals_time_series"],
		},
		{
			id: "vitals-by-page",
			parameters: ["vitals_by_page"],
		},
		{
			id: "vitals-by-country",
			parameters: ["vitals_by_country"],
		},
		{
			id: "vitals-by-browser",
			parameters: ["vitals_by_browser"],
		},
		{
			id: "vitals-by-device",
			parameters: ["vitals_by_device"],
		},
		{
			id: "vitals-by-region",
			parameters: ["vitals_by_region"],
		},
		{
			id: "vitals-by-city",
			parameters: ["vitals_by_city"],
		},
	];

	const { isLoading, getDataForQuery, refetch, isError } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const overviewData =
		(getDataForQuery("vitals-overview", "vitals_overview") as VitalMetric[]) ??
		[];
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

	const deviceBreakdownData =
		(getDataForQuery("vitals-by-device", "vitals_by_device") as Record<
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
				entry[row.metric_name] = row.p50;
			}
		}

		return Array.from(grouped.values());
	}, [timeSeriesData]);

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

	const totalSamples = overviewData.reduce(
		(sum, m) => sum + (m.samples ?? 0),
		0
	);

	const getMetricValue = (name: string): number | null => {
		const metric = overviewData.find((m) => m.metric_name === name);
		return metric?.p50 ?? null;
	};

	const getMetricSamples = (name: string): number | undefined => {
		const metric = overviewData.find((m) => m.metric_name === name);
		return metric?.samples;
	};

	const toggleMetric = useCallback(
		(metricName: string) => {
			setVisibleMetrics((prev) => ({
				...prev,
				[metricName]: !prev[metricName],
			}));
		},
		[setVisibleMetrics]
	);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			await refetch();
		} finally {
			setIsRefreshing(false);
		}
	}, [refetch, setIsRefreshing]);

	// Transform page breakdown data from EAV format to columnar format
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
				pageData[metricKey] = row.p50;
			}
		}

		return Array.from(pageMap.values()).sort((a, b) => b.samples - a.samples);
	}, [pageBreakdownData]);

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

	const deviceData = useMemo(
		(): VitalsBreakdownData[] =>
			deviceBreakdownData.map((item) => ({
				name: (item.name as string) || "",
				samples: (item.samples as number) || 0,
				visitors: (item.visitors as number) || undefined,
				lcp: (item.p50_lcp as number) || undefined,
				fcp: (item.p50_fcp as number) || undefined,
				cls: (item.p50_cls as number) || undefined,
				inp: (item.p50_inp as number) || undefined,
				ttfb: (item.p50_ttfb as number) || undefined,
			})),
		[deviceBreakdownData]
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
			});
		}

		if (countryData.length > 0) {
			tabs.push({
				id: "countries",
				label: "Countries",
				data: countryData,
				columns: createCountryColumns(),
			});
		}

		if (regionData.length > 0) {
			tabs.push({
				id: "regions",
				label: "Regions",
				data: regionData,
				columns: createRegionColumns(),
			});
		}

		if (cityData.length > 0) {
			tabs.push({
				id: "cities",
				label: "Cities",
				data: cityData,
				columns: createCityColumns(),
			});
		}

		if (browserData.length > 0) {
			tabs.push({
				id: "browsers",
				label: "Browsers",
				data: browserData,
				columns: createBrowserColumns(),
			});
		}

		if (deviceData.length > 0) {
			tabs.push({
				id: "devices",
				label: "Devices",
				data: deviceData,
				columns: createDeviceColumns(),
			});
		}

		return tabs;
	}, [
		pageVitalsTable,
		countryData,
		regionData,
		cityData,
		browserData,
		deviceData,
	]);

	const vitalKeys = Object.keys(VITAL_CONFIGS) as Array<
		keyof typeof VITAL_CONFIGS
	>;
	const activeCount = Object.values(visibleMetrics).filter(Boolean).length;

	return (
		<div className="relative flex h-full flex-col">
			<WebsitePageHeader
				description="Core Web Vitals and performance metrics (p50 values)"
				hasError={isError}
				icon={
					<HeartbeatIcon
						className="size-6 text-accent-foreground"
						weight="duotone"
					/>
				}
				isLoading={isLoading}
				isRefreshing={isRefreshing}
				onRefreshAction={handleRefresh}
				subtitle={
					isLoading
						? undefined
						: `${totalSamples.toLocaleString()} measurements · ${activeCount} metrics selected`
				}
				title="Web Vitals"
				websiteId={websiteId}
			/>

			<div className="space-y-4 p-4">
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
					{vitalKeys.map((key) => (
						<VitalGaugeCard
							isActive={visibleMetrics[key]}
							isLoading={isLoading}
							key={key}
							metricName={key}
							onToggleAction={() => toggleMetric(key)}
							samples={getMetricSamples(key)}
							value={getMetricValue(key)}
						/>
					))}
				</div>

				{chartMetrics.length > 0 ? (
					<SimpleMetricsChart
						data={chartData}
						description="p50 values over time"
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
						description="Breakdown showing p50 values"
						emptyMessage="No vitals breakdown data available"
						isLoading={isLoading}
						minHeight={500}
						tabs={vitalsTabs}
						title="Breakdown"
					/>
				) : (
					<div className="rounded border bg-card p-8 text-center">
						<p className="mx-auto text-muted-foreground text-sm">
							No breakdown data available. Vitals breakdowns will appear here
							once data is collected.
						</p>
					</div>
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
						<p className="mx-auto mt-1 text-muted-foreground text-sm">
							Web Vitals will appear here once your tracker starts collecting
							performance data from real users.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
