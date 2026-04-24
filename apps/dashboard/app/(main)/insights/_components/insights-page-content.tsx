"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { ChartLineIcon } from "@phosphor-icons/react/dist/ssr/ChartLine";
import { CursorIcon } from "@phosphor-icons/react/dist/ssr/Cursor";
import { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
import { LightbulbIcon } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { TimerIcon } from "@phosphor-icons/react/dist/ssr/Timer";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { UsersIcon } from "@phosphor-icons/react/dist/ssr/Users";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useInsightsFeed } from "@/app/(main)/insights/hooks/use-insights-feed";
import { useInsightsLocalState } from "@/app/(main)/insights/hooks/use-insights-local-state";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { StatCard } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/ds/empty-state";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { DataTable } from "@/components/table/data-table";
import {
	createGeoColumns,
	createPageColumns,
	createReferrerColumns,
	type GeoEntry,
	type PageEntry,
	type ReferrerEntry,
} from "@/components/table/rows";
import { DeleteDialog } from "@/components/ds/delete-dialog";
import { Button } from "@/components/ds/button";
import { DropdownMenu } from "@/components/ds/dropdown-menu";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { useWebsites } from "@/hooks/use-websites";
import dayjs from "@/lib/dayjs";
import { formatNumber } from "@/lib/formatters";
import {
	clearInsightsHistory,
	insightQueries,
	type InsightsAiResponse,
	type InsightsHistoryPage,
} from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { insightsRangeAtom } from "../lib/time-range";
import { CockpitNarrative } from "./cockpit-narrative";
import { CockpitSignals } from "./cockpit-signals";
import { TimeRangeSelector } from "./time-range-selector";

const insightsFocusSiteAtom = atomWithStorage<string | null>(
	"insights.focus-site",
	null
);

function rangeToDateRange(range: "7d" | "30d" | "90d") {
	const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
	return {
		start_date: dayjs()
			.subtract(days - 1, "day")
			.format("YYYY-MM-DD"),
		end_date: dayjs().format("YYYY-MM-DD"),
		granularity: "daily" as const,
	};
}

interface SummaryRow {
	bounce_rate?: number;
	median_session_duration?: number;
	pageviews?: number;
	sessions?: number;
	unique_visitors?: number;
}

function clampBounceRate(v: unknown): number {
	const n = Number(v ?? 0);
	if (Number.isNaN(n)) {
		return 0;
	}
	return Math.max(0, Math.min(100, n));
}

function formatDuration(value: number): string {
	if (!value || value < 60) {
		return `${Math.round(value || 0)}s`;
	}
	const minutes = Math.floor(value / 60);
	const seconds = Math.round(value % 60);
	return `${minutes}m ${seconds}s`;
}

interface FocusSitePickerProps {
	onChange: (id: string) => void;
	value: string | null;
	websites:
		| {
				domain: string;
				id: string;
				name: string | null;
		  }[]
		| undefined;
}

function FocusSitePicker({ websites, value, onChange }: FocusSitePickerProps) {
	const list = websites ?? [];
	const selected = list.find((w) => w.id === value) ?? list[0];
	if (!(selected && list.length > 1)) {
		return null;
	}
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				className={cn(
					"inline-flex items-center justify-center gap-1.5 rounded-md font-medium",
					"transition-all duration-(--duration-quick) ease-(--ease-smooth)",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					"disabled:pointer-events-none disabled:opacity-50",
					"h-8 px-3 text-xs",
					"bg-secondary text-foreground hover:bg-interactive-hover",
					"min-w-[180px] justify-between"
				)}
			>
				<span className="flex min-w-0 items-center gap-2">
					<FaviconImage
						className="shrink-0 rounded"
						domain={selected.domain}
						size={16}
					/>
					<span className="truncate font-medium text-sm">
						{selected.name ?? selected.domain}
					</span>
				</span>
				<CaretDownIcon className="ml-2 size-4 shrink-0" weight="fill" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" className="w-[240px]">
				{list.map((site) => (
					<DropdownMenu.Item
						className="gap-2"
						key={site.id}
						onClick={() => onChange(site.id)}
					>
						<FaviconImage
							className="shrink-0 rounded"
							domain={site.domain}
							size={16}
						/>
						<span className="min-w-0 flex-1 truncate">
							{site.name ?? site.domain}
						</span>
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

export function InsightsPageContent() {
	const queryClient = useQueryClient();
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const { insights, isLoading, isRefreshing, refetch } = useInsightsFeed();

	const range = useAtomValue(insightsRangeAtom);
	const { websites, isLoading: websitesLoading } = useWebsites();
	const [focusSiteId, setFocusSiteId] = useAtom(insightsFocusSiteAtom);

	const effectiveSiteId = useMemo(() => {
		if (!websites || websites.length === 0) {
			return "";
		}
		if (focusSiteId && websites.some((w) => w.id === focusSiteId)) {
			return focusSiteId;
		}
		return websites[0].id;
	}, [focusSiteId, websites]);

	const dateRange = useMemo(() => rangeToDateRange(range), [range]);

	const queries = useMemo(
		() => [
			{
				id: "cockpit-summary",
				parameters: ["summary_metrics", "events_by_date"],
				limit: 100,
				granularity: dateRange.granularity,
			},
			{
				id: "cockpit-pages",
				parameters: ["top_pages"],
				limit: 8,
				granularity: dateRange.granularity,
			},
			{
				id: "cockpit-referrers",
				parameters: ["top_referrers"],
				limit: 8,
				granularity: dateRange.granularity,
			},
			{
				id: "cockpit-geo",
				parameters: ["country"],
				limit: 8,
				granularity: dateRange.granularity,
			},
		],
		[dateRange.granularity]
	);

	const {
		getDataForQuery,
		isLoading: cockpitLoading,
		refetch: refetchCockpit,
	} = useBatchDynamicQuery(effectiveSiteId, dateRange, queries, {
		enabled: Boolean(effectiveSiteId),
	});

	const summary = (getDataForQuery("cockpit-summary", "summary_metrics") ??
		[])[0] as SummaryRow | undefined;
	const eventsByDate = (getDataForQuery("cockpit-summary", "events_by_date") ??
		[]) as Record<string, unknown>[];
	// DataTable requires name as a string or number, but ReferrerEntry inherits
	// an optional name from ReferrerSourceCellData. The analytics pipeline
	// always populates name, so narrow it here for the cockpit tables.
	type CockpitReferrerEntry = ReferrerEntry & { name: string };

	const topPages = (getDataForQuery("cockpit-pages", "top_pages") ??
		[]) as PageEntry[];
	const topReferrers = (getDataForQuery("cockpit-referrers", "top_referrers") ??
		[]) as CockpitReferrerEntry[];
	const topCountries = (getDataForQuery("cockpit-geo", "country") ??
		[]) as GeoEntry[];

	const miniCharts = useMemo(() => {
		const build = (field: string, transform?: (value: number) => number) =>
			eventsByDate.map((row) => ({
				date: String(row.date ?? "").slice(0, 10),
				value: transform
					? transform(Number(row[field] ?? 0))
					: Number(row[field] ?? 0),
			}));
		return {
			visitors: build("visitors"),
			sessions: build("sessions"),
			pageviews: build("pageviews"),
			bounce: build("bounce_rate", clampBounceRate),
			duration: build("median_session_duration"),
		};
	}, [eventsByDate]);

	const pageColumns = useMemo(() => createPageColumns(), []);
	const referrerColumns = useMemo(
		() => createReferrerColumns() as ColumnDef<CockpitReferrerEntry>[],
		[]
	);
	const countryColumns = useMemo(
		() => createGeoColumns({ type: "country" }),
		[]
	);

	const insightIdsForVotes = useMemo(
		() => insights.map((i) => i.id),
		[insights]
	);

	const { clearAllDismissedAction } = useInsightsLocalState(
		orgId,
		insightIdsForVotes
	);

	const [clearDialogOpen, setClearDialogOpen] = useState(false);

	const clearInsightsMutation = useMutation({
		mutationFn: () => clearInsightsHistory(orgId ?? ""),
		onSuccess: async (data) => {
			setClearDialogOpen(false);
			clearAllDismissedAction();
			if (orgId) {
				const emptyAi: InsightsAiResponse = {
					success: true,
					insights: [],
					source: "ai",
				};
				const emptyHistoryPage: InsightsHistoryPage = {
					success: true,
					insights: [],
					hasMore: false,
				};
				queryClient.setQueryData<InsightsAiResponse>(
					insightQueries.ai(orgId).queryKey,
					emptyAi
				);
				queryClient.setQueryData(
					insightQueries.historyInfinite(orgId).queryKey,
					{ pages: [emptyHistoryPage], pageParams: [0] }
				);
				await queryClient.invalidateQueries({
					queryKey: orpc.insights.getVotes.key(),
				});
			}
			toast.success(
				data.deleted === 0
					? "No stored insights to remove"
					: `Removed ${data.deleted} insight${data.deleted === 1 ? "" : "s"}`
			);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Could not clear insights"
			);
		},
	});

	const handleRefreshAll = useCallback(() => {
		refetch();
		refetchCockpit();
	}, [refetch, refetchCockpit]);

	const hasNoWebsites =
		!websitesLoading && websites !== undefined && websites.length === 0;

	return (
		<>
			<div
				aria-busy={isLoading || cockpitLoading || websitesLoading}
				className="flex h-full flex-col overflow-y-auto"
			>
				<PageHeader
					count={isLoading ? undefined : insights.length}
					description="Understand your business at a glance"
					icon={<LightbulbIcon weight="duotone" />}
					right={
						<div className="flex items-center gap-2">
							<FocusSitePicker
								onChange={setFocusSiteId}
								value={focusSiteId}
								websites={websites}
							/>
							<TimeRangeSelector />
							<Button
								aria-label="Refresh insights"
								disabled={isLoading || cockpitLoading}
								onClick={handleRefreshAll}
								size="icon"
								type="button"
								variant="outline"
							>
								<ArrowClockwiseIcon
									aria-hidden
									className={cn(
										"size-4",
										(isRefreshing || cockpitLoading) && "animate-spin"
									)}
								/>
							</Button>
							<Button
								disabled={!orgId || clearInsightsMutation.isPending}
								onClick={() => setClearDialogOpen(true)}
								type="button"
								variant="outline"
							>
								<TrashIcon className="size-4" weight="duotone" />
								Clear all
							</Button>
						</div>
					}
					title="Insights"
				/>

				{hasNoWebsites ? (
					<EmptyOrgState />
				) : (
					<div className="space-y-4 p-4 sm:p-5">
						<CockpitNarrative />

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
							<StatCard
								chartData={cockpitLoading ? undefined : miniCharts.visitors}
								formatValue={formatNumber}
								icon={UsersIcon}
								id="cockpit-visitors"
								isLoading={cockpitLoading}
								showChart
								title="Visitors"
								value={
									summary?.unique_visitors
										? formatNumber(summary.unique_visitors)
										: "0"
								}
							/>
							<StatCard
								chartData={cockpitLoading ? undefined : miniCharts.sessions}
								formatValue={formatNumber}
								icon={ChartLineIcon}
								id="cockpit-sessions"
								isLoading={cockpitLoading}
								showChart
								title="Sessions"
								value={summary?.sessions ? formatNumber(summary.sessions) : "0"}
							/>
							<StatCard
								chartData={cockpitLoading ? undefined : miniCharts.pageviews}
								formatValue={formatNumber}
								icon={GlobeIcon}
								id="cockpit-pageviews"
								isLoading={cockpitLoading}
								showChart
								title="Pageviews"
								value={
									summary?.pageviews ? formatNumber(summary.pageviews) : "0"
								}
							/>
							<StatCard
								chartData={cockpitLoading ? undefined : miniCharts.bounce}
								formatValue={(v) => `${v.toFixed(1)}%`}
								icon={CursorIcon}
								id="cockpit-bounce"
								invertTrend
								isLoading={cockpitLoading}
								showChart
								title="Bounce rate"
								value={
									summary?.bounce_rate == null
										? "0%"
										: `${clampBounceRate(summary.bounce_rate).toFixed(1)}%`
								}
							/>
							<StatCard
								chartData={cockpitLoading ? undefined : miniCharts.duration}
								formatChartValue={formatDuration}
								formatValue={formatDuration}
								icon={TimerIcon}
								id="cockpit-duration"
								isLoading={cockpitLoading}
								showChart
								title="Session duration"
								value={formatDuration(summary?.median_session_duration ?? 0)}
							/>
						</div>

						<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
							<DataTable
								columns={pageColumns}
								data={topPages}
								description="Most-visited pages"
								isLoading={cockpitLoading}
								minHeight={320}
								title="Top pages"
							/>
							<DataTable
								columns={referrerColumns}
								data={topReferrers}
								description="Where your traffic comes from"
								isLoading={cockpitLoading}
								minHeight={320}
								title="Top referrers"
							/>
						</div>

						<DataTable
							columns={countryColumns}
							data={topCountries}
							description="Audience by country"
							isLoading={cockpitLoading}
							minHeight={320}
							title="Top countries"
						/>

						<CockpitSignals />
					</div>
				)}
			</div>

			<DeleteDialog
				confirmDisabled={!orgId}
				confirmLabel="Clear all"
				description="This removes every stored insight for this organization from the database. Fresh insights will be generated on the next analysis run."
				isDeleting={clearInsightsMutation.isPending}
				isOpen={clearDialogOpen}
				onClose={() => setClearDialogOpen(false)}
				onConfirm={async () => {
					if (orgId) {
						await clearInsightsMutation.mutateAsync();
					}
				}}
				title="Clear all insights?"
			/>
		</>
	);
}

function EmptyOrgState() {
	return (
		<EmptyState
			action={{
				label: "Go to websites",
				onClick: () => {
					window.location.href = "/websites";
				},
			}}
			description="Add a website to see insights across your organization."
			icon={<GlobeIcon weight="duotone" />}
			title="No websites yet"
			variant="minimal"
		/>
	);
}
