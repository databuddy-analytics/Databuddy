"use client";

import { useInsightsFeed } from "@/app/(main)/insights/hooks/use-insights-feed";
import { useInsightsLocalState } from "@/app/(main)/insights/hooks/use-insights-local-state";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	clearInsightsHistory,
	INSIGHT_QUERY_KEYS,
	type InsightsAiResponse,
	type InsightsHistoryPage,
} from "@/lib/insight-api";
import type { Insight, InsightSeverity } from "@/lib/insight-types";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { ArrowsDownUpIcon } from "@phosphor-icons/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { FunnelIcon } from "@phosphor-icons/react";
import { SparkleIcon } from "@phosphor-icons/react";
import { TrashIcon } from "@phosphor-icons/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { XIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { InsightCard } from "./insight-card";

type SeverityFilter = "all" | InsightSeverity;
type SortMode = "priority" | "newest" | "change";

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
	{ value: "all", label: "All severities" },
	{ value: "critical", label: "Critical" },
	{ value: "warning", label: "Warning" },
	{ value: "info", label: "Info" },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
	{ value: "priority", label: "Priority" },
	{ value: "newest", label: "Newest" },
	{ value: "change", label: "Biggest change" },
];

function sortInsights(items: Insight[], mode: SortMode): Insight[] {
	const sorted = [...items];
	switch (mode) {
		case "priority":
			return sorted.sort((a, b) => b.priority - a.priority);
		case "newest":
			return sorted.sort((a, b) => {
				const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
				const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
				return bTime - aTime;
			});
		case "change":
			return sorted.sort(
				(a, b) =>
					Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0)
			);
		default:
			return sorted;
	}
}

export function InsightsPageContent() {
	const queryClient = useQueryClient();
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const {
		insights,
		isLoading,
		isRefreshing,
		isError,
		refetch,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useInsightsFeed();

	const insightIdsForVotes = useMemo(
		() => insights.map((i) => i.id),
		[insights]
	);

	const {
		hydrated,
		dismissedIdSet,
		dismissAction,
		clearAllDismissedAction,
		feedbackById,
		setFeedbackAction,
	} = useInsightsLocalState(orgId, insightIdsForVotes);

	const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
	const [websiteFilter, setWebsiteFilter] = useState("all");
	const [sortMode, setSortMode] = useState<SortMode>("priority");
	const [showDismissed, setShowDismissed] = useState(false);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [clearDialogOpen, setClearDialogOpen] = useState(false);

	const clearInsightsMutation = useMutation({
		mutationFn: () => clearInsightsHistory(orgId ?? ""),
		onSuccess: async (data) => {
			setClearDialogOpen(false);
			setExpandedId(null);
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
					[INSIGHT_QUERY_KEYS.ai, orgId],
					emptyAi
				);
				queryClient.setQueryData([INSIGHT_QUERY_KEYS.historyInfinite, orgId], {
					pages: [emptyHistoryPage],
					pageParams: [0],
				});
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

	const websites = useMemo(() => {
		const map = new Map<string, string>();
		for (const i of insights) {
			if (!map.has(i.websiteId)) {
				map.set(i.websiteId, i.websiteName ?? i.websiteDomain);
			}
		}
		return [...map.entries()].map(([id, name]) => ({ id, name }));
	}, [insights]);

	const filteredInsights = useMemo(() => {
		const filtered = insights.filter((i) => {
			if (!showDismissed && dismissedIdSet.has(i.id)) {
				return false;
			}
			if (severityFilter !== "all" && i.severity !== severityFilter) {
				return false;
			}
			if (websiteFilter !== "all" && i.websiteId !== websiteFilter) {
				return false;
			}
			return true;
		});
		return sortInsights(filtered, sortMode);
	}, [
		insights,
		severityFilter,
		websiteFilter,
		dismissedIdSet,
		showDismissed,
		sortMode,
	]);

	const counts = useMemo(
		() => ({
			total: insights.length,
			critical: insights.filter((i) => i.severity === "critical").length,
			warning: insights.filter((i) => i.severity === "warning").length,
			info: insights.filter((i) => i.severity === "info").length,
		}),
		[insights]
	);

	const controlsLocked =
		isLoading || clearInsightsMutation.isPending || isFetchingNextPage;
	const hasActiveFilters = severityFilter !== "all" || websiteFilter !== "all";

	const clearFilters = () => {
		setSeverityFilter("all");
		setWebsiteFilter("all");
	};

	const selectedWebsiteName =
		websiteFilter === "all"
			? "All Websites"
			: (websites.find((w) => w.id === websiteFilter)?.name ?? "All Websites");

	const selectedSeverityLabel =
		SEVERITY_OPTIONS.find((o) => o.value === severityFilter)?.label ??
		"All severities";

	const selectedSortLabel =
		SORT_OPTIONS.find((o) => o.value === sortMode)?.label ?? "Priority";

	const scrollRef = useRef<HTMLDivElement>(null);
	const hasScrolledToHash = useRef(false);

	const scrollToHashInsight = useCallback(() => {
		if (typeof window === "undefined") {
			return;
		}
		const raw = window.location.hash.slice(1);
		if (!raw.startsWith("insight-")) {
			return;
		}
		const el = document.getElementById(raw);
		const container = scrollRef.current;
		if (!(el && container)) {
			return;
		}
		requestAnimationFrame(() => {
			const containerRect = container.getBoundingClientRect();
			const elRect = el.getBoundingClientRect();
			const nextTop = container.scrollTop + (elRect.top - containerRect.top);
			container.scrollTo({ behavior: "smooth", top: nextTop });
			const targetId = raw.replace("insight-", "");
			setExpandedId(targetId);
		});
	}, []);

	useEffect(() => {
		if (
			hasScrolledToHash.current ||
			!hydrated ||
			isLoading ||
			filteredInsights.length === 0
		) {
			return;
		}
		hasScrolledToHash.current = true;
		scrollToHashInsight();
	}, [hydrated, isLoading, filteredInsights.length, scrollToHashInsight]);

	const showFilterBar = !(isLoading || isError) && insights.length > 0;

	return (
		<>
			<div className="h-full overflow-y-auto" ref={scrollRef}>
				<PageHeader
					count={isLoading ? undefined : insights.length}
					description="Week-over-week AI analysis across all your websites"
					icon={<SparkleIcon weight="duotone" />}
					right={
						<div className="flex items-center gap-2">
							{websites.length > 1 && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											className="min-w-[140px] justify-between"
											disabled={controlsLocked}
											variant="outline"
										>
											<span className="truncate">{selectedWebsiteName}</span>
											<CaretDownIcon className="ml-2 size-4" weight="fill" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-[200px]">
										<DropdownMenuItem onClick={() => setWebsiteFilter("all")}>
											All Websites
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										{websites.map((w) => (
											<DropdownMenuItem
												key={w.id}
												onClick={() => setWebsiteFilter(w.id)}
											>
												{w.name}
											</DropdownMenuItem>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
							<Button
								aria-label="Refresh insights"
								disabled={isLoading}
								onClick={() => refetch()}
								size="icon"
								type="button"
								variant="outline"
							>
								<ArrowClockwiseIcon
									aria-hidden
									className={cn("size-4", isRefreshing && "animate-spin")}
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

				{showFilterBar && (
					<div className="flex items-center gap-2 border-b px-4 py-2 sm:px-6">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									className={cn(
										"flex items-center gap-1.5 rounded px-2 py-1 font-medium text-xs transition-colors",
										severityFilter === "all"
											? "text-muted-foreground hover:text-foreground"
											: "bg-primary/10 text-primary"
									)}
									type="button"
								>
									<FunnelIcon className="size-3.5" />
									{selectedSeverityLabel}
									<CaretDownIcon className="size-3" weight="fill" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{SEVERITY_OPTIONS.map((opt) => {
									const count =
										opt.value === "all" ? counts.total : counts[opt.value];
									if (opt.value !== "all" && count === 0) {
										return null;
									}
									return (
										<DropdownMenuItem
											key={opt.value}
											onClick={() => setSeverityFilter(opt.value)}
										>
											<span className="flex-1">{opt.label}</span>
											<span className="font-mono text-muted-foreground text-xs tabular-nums">
												{count}
											</span>
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuContent>
						</DropdownMenu>

						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									className="flex items-center gap-1.5 rounded px-2 py-1 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground"
									type="button"
								>
									<ArrowsDownUpIcon className="size-3.5" />
									{selectedSortLabel}
									<CaretDownIcon className="size-3" weight="fill" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								{SORT_OPTIONS.map((opt) => (
									<DropdownMenuItem
										key={opt.value}
										onClick={() => setSortMode(opt.value)}
									>
										{opt.label}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>

						{dismissedIdSet.size > 0 && (
							<button
								className={cn(
									"text-xs transition-colors",
									showDismissed
										? "font-medium text-foreground"
										: "text-muted-foreground hover:text-foreground"
								)}
								onClick={() => setShowDismissed((v) => !v)}
								type="button"
							>
								{showDismissed
									? "Hide dismissed"
									: `Show dismissed (${dismissedIdSet.size})`}
							</button>
						)}

						{hasActiveFilters && (
							<button
								className="ml-auto flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
								onClick={clearFilters}
								type="button"
							>
								<XIcon className="size-3" />
								Clear
							</button>
						)}
					</div>
				)}

				{isLoading && (
					<InsightsFetchStatusRow
						description="Comparing week-over-week traffic, errors, and referrers"
						title="Loading insights…"
						variant="initial"
					/>
				)}

				{!(isLoading || isError) && isRefreshing && (
					<InsightsFetchStatusRow
						description="Refreshing analysis from your data"
						title="Updating insights…"
						variant="refresh"
					/>
				)}

				{!isLoading && isError && <ErrorState onRetryAction={refetch} />}

				{!(isLoading || isError) && (
					<>
						{insights.length === 0 && !isRefreshing && <AllHealthyState />}

						{filteredInsights.length > 0 &&
							filteredInsights.map((insight) => (
								<InsightCard
									expanded={expandedId === insight.id}
									feedbackVote={feedbackById[insight.id] ?? null}
									insight={insight}
									key={insight.id}
									onDismissAction={() => dismissAction(insight.id)}
									onFeedbackAction={(vote) =>
										setFeedbackAction(insight.id, vote)
									}
									onToggleAction={() =>
										setExpandedId((prev) =>
											prev === insight.id ? null : insight.id
										)
									}
								/>
							))}

						{insights.length > 0 && filteredInsights.length === 0 && (
							<NoMatchState
								onClearAction={clearFilters}
								onShowDismissedAction={
									dismissedIdSet.size > 0
										? () => setShowDismissed(true)
										: undefined
								}
							/>
						)}

						{hasNextPage && (
							<div className="flex justify-center border-b py-4">
								<Button
									disabled={isFetchingNextPage}
									onClick={() => fetchNextPage()}
									type="button"
									variant="outline"
								>
									{isFetchingNextPage ? (
										<>
											<ArrowClockwiseIcon className="size-4 animate-spin" />
											Loading…
										</>
									) : (
										"Load more history"
									)}
								</Button>
							</div>
						)}

						{hydrated && dismissedIdSet.size > 0 && (
							<div className="flex justify-center py-6">
								<Button
									onClick={clearAllDismissedAction}
									type="button"
									variant="ghost"
								>
									Clear all dismissed
								</Button>
							</div>
						)}
					</>
				)}
			</div>

			<AlertDialog onOpenChange={setClearDialogOpen} open={clearDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="text-balance">
							Clear all insights?
						</AlertDialogTitle>
						<AlertDialogDescription className="text-pretty">
							This removes every stored insight for this organization from the
							database. Fresh insights will be generated on the next analysis
							run.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={clearInsightsMutation.isPending || !orgId}
							onClick={(e) => {
								e.preventDefault();
								if (orgId) {
									clearInsightsMutation.mutate();
								}
							}}
							type="button"
						>
							{clearInsightsMutation.isPending ? "Clearing…" : "Clear all"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function InsightsFetchStatusRow({
	title,
	description,
	variant,
}: {
	title: string;
	description: string;
	variant: "initial" | "refresh";
}) {
	return (
		<div
			aria-live="polite"
			className="flex h-10 shrink-0 items-center gap-2 border-b px-4 sm:px-6"
			role="status"
		>
			{variant === "refresh" ? (
				<ArrowClockwiseIcon
					aria-hidden
					className="size-4 shrink-0 animate-spin text-primary"
				/>
			) : (
				<SparkleIcon
					aria-hidden
					className="size-4 shrink-0 animate-pulse text-primary"
					weight="duotone"
				/>
			)}
			<div className="min-w-0">
				<p className="text-pretty font-medium text-foreground text-sm">
					{title}
				</p>
				<p className="sr-only">{description}</p>
			</div>
		</div>
	);
}

function ErrorState({ onRetryAction }: { onRetryAction: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
				<WarningCircleIcon className="size-5 text-red-500" weight="duotone" />
			</div>
			<div className="space-y-1">
				<p className="font-medium text-foreground">Couldn't load insights</p>
				<p className="text-muted-foreground text-sm">
					AI analysis timed out or failed. Try again.
				</p>
			</div>
			<Button onClick={onRetryAction} size="sm" variant="outline">
				<ArrowClockwiseIcon className="size-4" />
				Retry
			</Button>
		</div>
	);
}

function AllHealthyState() {
	return (
		<div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
				<CheckCircleIcon className="size-5 text-emerald-500" weight="fill" />
			</div>
			<div className="space-y-1">
				<p className="font-medium text-foreground">All systems healthy</p>
				<p className="text-pretty text-muted-foreground text-sm">
					No actionable insights detected across your websites this week
				</p>
			</div>
		</div>
	);
}

function NoMatchState({
	onClearAction,
	onShowDismissedAction,
}: {
	onClearAction: () => void;
	onShowDismissedAction?: () => void;
}) {
	return (
		<div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent">
				<FunnelIcon className="size-5 text-muted-foreground" weight="duotone" />
			</div>
			<div className="space-y-1">
				<p className="font-medium text-foreground">No matching insights</p>
				<p className="text-muted-foreground text-sm">
					Try adjusting your filters
				</p>
			</div>
			<div className="flex flex-wrap items-center justify-center gap-2">
				<Button onClick={onClearAction} size="sm" variant="outline">
					Clear filters
				</Button>
				{onShowDismissedAction && (
					<Button
						onClick={onShowDismissedAction}
						size="sm"
						type="button"
						variant="outline"
					>
						Show dismissed
					</Button>
				)}
			</div>
		</div>
	);
}
