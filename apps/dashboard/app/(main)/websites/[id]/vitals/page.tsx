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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import { WebsitePageHeader } from "../_components/website-page-header";

type Percentile = "p50" | "p75" | "p90" | "p95" | "p99";

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

type VitalVisibility = Record<string, boolean>;

const PERCENTILE_OPTIONS: { value: Percentile; label: string }[] = [
	{ value: "p50", label: "p50" },
	{ value: "p75", label: "p75" },
	{ value: "p90", label: "p90" },
	{ value: "p95", label: "p95" },
	{ value: "p99", label: "p99" },
];

const PERCENTILE_DESCRIPTIONS: Record<Percentile, string> = {
	p50: "Median",
	p75: "Recommended",
	p90: "90th percentile",
	p95: "95th percentile",
	p99: "99th percentile",
};

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

	const [selectedPercentile, setSelectedPercentile] =
		usePersistentState<Percentile>(`vitals-percentile-${websiteId}`, "p75");

	const queries = [
		{
			id: "vitals-overview",
			parameters: ["vitals_overview"],
		},
		{
			id: "vitals-time-series",
			parameters: ["vitals_time_series"],
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

	const totalSamples = overviewData.reduce(
		(sum, m) => sum + (m.samples ?? 0),
		0
	);

	const getMetricValue = (name: string): number | null => {
		const metric = overviewData.find((m) => m.metric_name === name);
		return metric?.[selectedPercentile] ?? null;
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

	const vitalKeys = Object.keys(VITAL_CONFIGS) as Array<
		keyof typeof VITAL_CONFIGS
	>;
	const activeCount = Object.values(visibleMetrics).filter(Boolean).length;

	return (
		<div className="relative flex h-full flex-col">
			<WebsitePageHeader
				additionalActions={
					<SegmentedControl
						onValueChangeAction={setSelectedPercentile}
						options={PERCENTILE_OPTIONS}
						value={selectedPercentile}
					/>
				}
				description={`Core Web Vitals and performance metrics (${PERCENTILE_DESCRIPTIONS[selectedPercentile]} values)`}
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
						description={`${PERCENTILE_DESCRIPTIONS[selectedPercentile]} values over time`}
						height={300}
						isLoading={isLoading}
						metrics={chartMetrics}
						title="Performance Trend"
					/>
				) : (
					<div className="rounded border bg-card p-8 text-center">
						<p className="text-muted-foreground text-sm">
							Click on a metric above to add it to the chart
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
						<p className="mt-1 text-muted-foreground text-sm">
							Web Vitals will appear here once your tracker starts collecting
							performance data from real users.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
