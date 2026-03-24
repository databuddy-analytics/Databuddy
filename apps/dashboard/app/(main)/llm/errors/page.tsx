"use client";

import { ClockIcon, RobotIcon, WarningIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DataTable, type TabConfig } from "@/components/table/data-table";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import dayjs from "@/lib/dayjs";
import { useLLMPageContext } from "../_components/llm-page-context";
import {
	formatDuration,
	formatNumber,
	type LLMErrorBreakdownData,
	type LLMErrorSeriesData,
	type LLMHttpStatusData,
	type LLMRecentErrorData,
} from "../_components/llm-types";
import { LLMErrorDetailModal } from "./_components/llm-error-detail-modal";

function getRelativeTime(timestamp: string): string {
	const date = dayjs(timestamp);
	if (!date.isValid()) {
		return "";
	}
	return date.fromNow();
}

function formatDateTimeSeconds(timestamp: string): string {
	const date = new Date(timestamp);
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function getHttpStatusSeverity(
	status?: number
): "high" | "medium" | "low" | null {
	if (!status) {
		return null;
	}
	if (status >= 500) {
		return "high";
	}
	if (status >= 400) {
		return "medium";
	}
	return "low";
}

function getSeverityColor(severity: "high" | "medium" | "low"): string {
	const colors = {
		high: "bg-destructive/10 text-destructive border-destructive/20",
		medium: "bg-chart-2/10 text-chart-2 border-chart-2/20",
		low: "bg-chart-3/10 text-chart-3 border-chart-3/20",
	};
	return colors[severity];
}

const SeverityDot = ({ severity }: { severity: "high" | "medium" | "low" }) => {
	const colors = {
		high: "bg-destructive",
		medium: "bg-chart-2",
		low: "bg-chart-3",
	};
	return (
		<span
			className={`size-2 shrink-0 rounded-full ${colors[severity]}`}
			title={`${severity} severity`}
		/>
	);
};

const errorBreakdownColumns: ColumnDef<
	LLMErrorBreakdownData & { name: string }
>[] = [
	{
		id: "error_name",
		accessorKey: "error_name",
		header: "Error",
		cell: ({ row }) => (
			<div className="flex items-center gap-2">
				<WarningIcon className="size-4 text-destructive" weight="duotone" />
				<span className="font-medium text-foreground">
					{row.original.error_name}
				</span>
			</div>
		),
	},
	{
		id: "error_count",
		accessorKey: "error_count",
		header: "Count",
		cell: ({ row }) => (
			<span className="tabular-nums">
				{formatNumber(row.original.error_count)}
			</span>
		),
	},
	{
		id: "sample_message",
		accessorKey: "sample_message",
		header: "Sample Message",
		cell: ({ row }) => (
			<Tooltip skipProvider>
				<TooltipTrigger asChild>
					<span className="block max-w-[350px] truncate text-muted-foreground">
						{row.original.sample_message || "—"}
					</span>
				</TooltipTrigger>
				{row.original.sample_message && (
					<TooltipContent className="max-w-md">
						<p className="wrap-break-word whitespace-pre-wrap font-mono text-xs">
							{row.original.sample_message}
						</p>
					</TooltipContent>
				)}
			</Tooltip>
		),
	},
];

const httpStatusColumns: ColumnDef<LLMHttpStatusData & { name: string }>[] = [
	{
		id: "http_status",
		accessorKey: "http_status",
		header: "Status Code",
		cell: ({ row }) => {
			const status = row.original.http_status;
			const severity = getHttpStatusSeverity(status);
			return (
				<div className="flex items-center gap-2">
					{severity && <SeverityDot severity={severity} />}
					<span className="font-mono tabular-nums">{status}</span>
				</div>
			);
		},
	},
	{
		id: "calls",
		accessorKey: "calls",
		header: "Count",
		cell: ({ row }) => (
			<span className="tabular-nums">{formatNumber(row.original.calls)}</span>
		),
	},
];

export default function LLMErrorsPage() {
	const { queryOptions, dateRange, hasQueryId, isLoadingOrg } =
		useLLMPageContext();

	const [selectedError, setSelectedError] = useState<LLMRecentErrorData | null>(
		null
	);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const handleViewError = useCallback((error: LLMRecentErrorData) => {
		setSelectedError(error);
		setIsModalOpen(true);
	}, []);

	const handleCloseModal = useCallback(() => {
		setIsModalOpen(false);
		setSelectedError(null);
	}, []);

	const queries = useMemo(
		() => [
			{ id: "llm-error-series", parameters: ["llm_error_rate_time_series"] },
			{ id: "llm-errors", parameters: ["llm_error_breakdown"] },
			{ id: "llm-status", parameters: ["llm_http_status_breakdown"] },
			{ id: "llm-recent-errors", parameters: ["llm_recent_errors"] },
		],
		[]
	);

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		queryOptions,
		dateRange,
		queries,
		{ enabled: hasQueryId }
	);

	const errorSeries =
		(getDataForQuery(
			"llm-error-series",
			"llm_error_rate_time_series"
		) as LLMErrorSeriesData[]) ?? [];

	const errorBreakdown =
		(getDataForQuery(
			"llm-errors",
			"llm_error_breakdown"
		) as LLMErrorBreakdownData[]) ?? [];

	const statusBreakdown =
		(getDataForQuery(
			"llm-status",
			"llm_http_status_breakdown"
		) as LLMHttpStatusData[]) ?? [];

	const recentErrors =
		(getDataForQuery(
			"llm-recent-errors",
			"llm_recent_errors"
		) as LLMRecentErrorData[]) ?? [];

	const chartData = useMemo(
		() =>
			errorSeries.map((row) => ({
				date: row.date,
				errors: row.error_count ?? 0,
				rate: (row.error_rate ?? 0) * 100,
			})),
		[errorSeries]
	);

	const breakdownTabs = useMemo(() => {
		const tabs: TabConfig<
			(LLMErrorBreakdownData | LLMHttpStatusData) & { name: string }
		>[] = [];

		if (errorBreakdown.length > 0) {
			tabs.push({
				id: "errors",
				label: "By Error Type",
				data: errorBreakdown.map((row) => ({ ...row, name: row.error_name })),
				columns: errorBreakdownColumns,
			});
		}

		if (statusBreakdown.length > 0) {
			tabs.push({
				id: "http-status",
				label: "By HTTP Status",
				data: statusBreakdown.map((row) => ({
					...row,
					name: String(row.http_status),
				})),
				columns: httpStatusColumns,
			});
		}

		return tabs;
	}, [errorBreakdown, statusBreakdown]);

	const recentErrorsData = useMemo(
		() => recentErrors.map((row) => ({ ...row, name: row.error_name })),
		[recentErrors]
	);

	const recentErrorColumns: ColumnDef<LLMRecentErrorData & { name: string }>[] =
		useMemo(
			() => [
				{
					id: "severity",
					accessorKey: "http_status",
					header: "",
					size: 32,
					cell: ({ row }) => {
						const severity = getHttpStatusSeverity(row.original.http_status);
						return (
							<div className="flex items-center justify-center">
								{severity ? (
									<SeverityDot severity={severity} />
								) : (
									<SeverityDot severity="medium" />
								)}
							</div>
						);
					},
				},
				{
					id: "error",
					accessorKey: "error_name",
					header: "Error",
					size: 400,
					cell: ({ row }) => {
						const error = row.original;

						return (
							<div className="flex min-w-0 flex-col gap-1.5 py-1">
								<div className="flex flex-wrap items-center gap-1.5">
									<div className="flex size-5 shrink-0 items-center justify-center rounded bg-destructive/10">
										<WarningIcon
											className="size-3 text-destructive"
											weight="fill"
										/>
									</div>
									<span className="font-medium text-destructive text-sm">
										{error.error_name}
									</span>
								</div>
							</div>
						);
					},
				},
				{
					id: "model",
					accessorKey: "model",
					header: "Model",
					size: 160,
					cell: ({ row }) => (
						<Tooltip skipProvider>
							<TooltipTrigger asChild>
								<div className="flex min-w-0 items-center gap-1.5">
									<RobotIcon
										className="size-3.5 shrink-0 text-muted-foreground"
										weight="duotone"
									/>
									<span className="truncate font-mono text-sm">
										{row.original.model}
									</span>
								</div>
							</TooltipTrigger>
							<TooltipContent>
								<div className="flex flex-col gap-1 text-xs">
									<span>Model: {row.original.model}</span>
									<span>Provider: {row.original.provider}</span>
								</div>
							</TooltipContent>
						</Tooltip>
					),
				},
				{
					id: "http_status",
					accessorKey: "http_status",
					header: "Status",
					size: 80,
					cell: ({ row }) => {
						const status = row.original.http_status;
						if (!status) {
							return <span className="text-muted-foreground">—</span>;
						}
						const severity = getHttpStatusSeverity(status);
						return (
							<Badge
								className={severity ? getSeverityColor(severity) : undefined}
								variant="outline"
							>
								{status}
							</Badge>
						);
					},
				},
				{
					id: "duration_ms",
					accessorKey: "duration_ms",
					header: "Latency",
					cell: ({ row }) => (
						<span className="text-muted-foreground tabular-nums">
							{formatDuration(row.original.duration_ms)}
						</span>
					),
				},
				{
					id: "timestamp",
					accessorKey: "timestamp",
					header: "Time",
					cell: ({ row }) => {
						const time = row.original.timestamp;
						const relative = getRelativeTime(time);
						const full = formatDateTimeSeconds(time);

						return (
							<Tooltip skipProvider>
								<TooltipTrigger asChild>
									<div className="flex items-center gap-1.5 text-muted-foreground">
										<ClockIcon className="size-3.5 shrink-0" weight="duotone" />
										<span className="whitespace-nowrap text-sm">
											{relative}
										</span>
									</div>
								</TooltipTrigger>
								<TooltipContent>
									<span className="font-mono text-xs">{full}</span>
								</TooltipContent>
							</Tooltip>
						);
					},
				},
			],
			[]
		);

	const isPageLoading = isLoadingOrg || isLoading;

	return (
		<div className="space-y-3 p-4 sm:space-y-4 sm:p-6">
			<SimpleMetricsChart
				data={chartData}
				description="Error count and rate over time"
				height={240}
				isLoading={isPageLoading}
				metrics={[
					{
						key: "errors",
						label: "Errors",
						color: "#ef4444",
						formatValue: (v) => formatNumber(v),
					},
					{
						key: "rate",
						label: "Error Rate",
						color: "#f97316",
						formatValue: (v) => {
							const safeValue = v == null || Number.isNaN(v) ? 0 : v;
							return `${safeValue.toFixed(1)}%`;
						},
					},
				]}
				title="Error Trends"
			/>

			{breakdownTabs.length > 0 && (
				<DataTable
					description="Errors grouped by type and HTTP status"
					isLoading={isPageLoading}
					tabs={breakdownTabs}
					title="Error Breakdown"
				/>
			)}

			<DataTable
				columns={recentErrorColumns}
				data={recentErrorsData}
				description="Click on an error to view full details"
				emptyMessage="No errors recorded in this time period"
				initialPageSize={10}
				isLoading={isPageLoading}
				onRowAction={(row) => handleViewError(row)}
				title="Recent Errors"
			/>

			{selectedError && (
				<LLMErrorDetailModal
					error={selectedError}
					isOpen={isModalOpen}
					onCloseAction={handleCloseModal}
				/>
			)}
		</div>
	);
}
