"use client";

import {
	ArrowClockwiseIcon,
	ClockIcon,
	GlobeIcon,
	LockSimpleIcon,
	ShieldCheckIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useManualInvoke } from "../../agent/_components/hooks/use-manual-invoke";

type OverviewData = {
	total_checks: number;
	successful_checks: number;
	failed_checks: number;
	pending_checks: number;
	uptime_percentage: number;
	avg_response_time: number;
	p50_response_time: number;
	p95_response_time: number;
	p99_response_time: number;
	max_response_time: number;
	min_response_time: number;
	avg_ttfb: number;
	ssl_expiry: string | null;
	ssl_valid: number;
};

type RegionData = {
	region: string;
	total_checks: number;
	successful_checks: number;
	failed_checks: number;
	uptime_percentage: number;
	avg_response_time: number;
	p95_response_time: number;
};

export function UptimeOverview() {
	const params = useParams();
	const websiteId = params.id as string;
	const { invoke, isLoading } = useManualInvoke();
	const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
	const [regionData, setRegionData] = useState<RegionData[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [lastFetched, setLastFetched] = useState<Date | null>(null);

	const fetchOverview = async () => {
		setError(null);
		try {
			const [overviewResult, regionResult] = await Promise.all([
				invoke({
					tool: "uptime_overview",
					params: {
						from: dayjs().subtract(30, "day").format("YYYY-MM-DD"),
						to: dayjs().format("YYYY-MM-DD"),
					},
				}),
				invoke({
					tool: "uptime_by_region",
					params: {
						from: dayjs().subtract(30, "day").format("YYYY-MM-DD"),
						to: dayjs().format("YYYY-MM-DD"),
					},
				}),
			]);

			if (overviewResult.success && overviewResult.data?.[0]) {
				setOverviewData(overviewResult.data[0] as OverviewData);
			}
			if (regionResult.success && regionResult.data) {
				setRegionData(regionResult.data as RegionData[]);
			}
			setLastFetched(new Date());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch overview");
		}
	};

	const formatMs = (ms: number) => {
		if (ms < 1000) return `${Math.round(ms)}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	};

	return (
		<div className="border-b bg-sidebar">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div className="flex items-center gap-2">
					<h3 className="font-semibold text-lg text-sidebar-foreground tracking-tight">
						Uptime Overview
					</h3>
					{lastFetched && (
						<span className="text-muted-foreground text-xs">
							Last updated {dayjs(lastFetched).format("HH:mm:ss")}
						</span>
					)}
				</div>
				<Button
					disabled={isLoading}
					onClick={fetchOverview}
					size="sm"
					variant="outline"
				>
					<ArrowClockwiseIcon
						className={isLoading ? "animate-spin" : ""}
						size={16}
					/>
					{overviewData ? "Refresh" : "Load Stats"}
				</Button>
			</div>

			{error && (
				<div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			)}

			{overviewData ? (
				<div className="p-4">
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
						{/* Uptime Percentage */}
						<div className="rounded-lg border bg-background p-3">
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
								<ShieldCheckIcon size={14} />
								Uptime (30d)
							</div>
							<p
								className={`font-mono font-semibold text-2xl ${
									overviewData.uptime_percentage >= 99.9
										? "text-emerald-600"
										: overviewData.uptime_percentage >= 99
											? "text-amber-600"
											: "text-red-600"
								}`}
							>
								{overviewData.uptime_percentage.toFixed(2)}%
							</p>
							<p className="text-muted-foreground text-xs">
								{overviewData.successful_checks}/{overviewData.total_checks}{" "}
								checks passed
							</p>
						</div>

						{/* Average Response Time */}
						<div className="rounded-lg border bg-background p-3">
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
								<ClockIcon size={14} />
								Avg Response
							</div>
							<p className="font-mono font-semibold text-2xl">
								{formatMs(overviewData.avg_response_time)}
							</p>
							<p className="text-muted-foreground text-xs">
								p95: {formatMs(overviewData.p95_response_time)}
							</p>
						</div>

						{/* TTFB */}
						<div className="rounded-lg border bg-background p-3">
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
								<ClockIcon size={14} />
								Avg TTFB
							</div>
							<p className="font-mono font-semibold text-2xl">
								{formatMs(overviewData.avg_ttfb)}
							</p>
							<p className="text-muted-foreground text-xs">
								Time to first byte
							</p>
						</div>

						{/* SSL Status */}
						<div className="rounded-lg border bg-background p-3">
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
								<LockSimpleIcon size={14} />
								SSL Certificate
							</div>
							<p
								className={`font-semibold text-2xl ${
									overviewData.ssl_valid === 1
										? "text-emerald-600"
										: "text-red-600"
								}`}
							>
								{overviewData.ssl_valid === 1 ? "Valid" : "Invalid"}
							</p>
							{overviewData.ssl_expiry && (
								<p className="text-muted-foreground text-xs">
									Expires {dayjs(overviewData.ssl_expiry).format("MMM D, YYYY")}
								</p>
							)}
						</div>
					</div>

					{/* Region breakdown */}
					{regionData.length > 0 && (
						<div className="mt-4">
							<h4 className="mb-2 flex items-center gap-2 font-medium text-muted-foreground text-sm">
								<GlobeIcon size={14} />
								Performance by Region
							</h4>
							<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
								{regionData.map((region) => (
									<div
										className="flex items-center justify-between rounded border bg-background px-3 py-2"
										key={region.region}
									>
										<div>
											<span className="font-mono text-sm">
												{region.region || "Global"}
											</span>
											<span className="ml-2 text-muted-foreground text-xs">
												({region.total_checks} checks)
											</span>
										</div>
										<div className="text-right">
											<span
												className={`font-mono text-sm ${
													region.uptime_percentage >= 99.9
														? "text-emerald-600"
														: region.uptime_percentage >= 99
															? "text-amber-600"
															: "text-red-600"
												}`}
											>
												{region.uptime_percentage.toFixed(1)}%
											</span>
											<span className="ml-2 text-muted-foreground text-xs">
												{formatMs(region.avg_response_time)}
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			) : (
				<div className="p-4 text-center">
					<p className="text-muted-foreground text-sm">
						Click &quot;Load Stats&quot; to fetch 30-day uptime overview and
						performance metrics.
					</p>
				</div>
			)}
		</div>
	);
}
