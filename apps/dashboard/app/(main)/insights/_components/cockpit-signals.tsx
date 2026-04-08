"use client";

import { useInsightsFeed } from "@/app/(main)/insights/hooks/use-insights-feed";
import { useInsightsLocalState } from "@/app/(main)/insights/hooks/use-insights-local-state";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Insight, InsightSeverity } from "@/lib/insight-types";
import { cn } from "@/lib/utils";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowsDownUpIcon } from "@phosphor-icons/react/dist/ssr/ArrowsDownUp";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { FunnelIcon } from "@phosphor-icons/react/dist/ssr/Funnel";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";
import {
	type ReactElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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

export function CockpitSignals(): ReactElement {
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

	const controlsLocked = isLoading || isFetchingNextPage;
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

	const sectionRef = useRef<HTMLElement>(null);
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
		if (!el) {
			return;
		}
		requestAnimationFrame(() => {
			el.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
	const visibleCount = filteredInsights.length;

	return (
		<section
			aria-label="Signals"
			className="overflow-hidden rounded border bg-card"
			ref={sectionRef}
		>
			<div className="flex items-center justify-between gap-3 border-b px-4 py-3">
				<div className="flex items-center gap-2">
					<SparkleIcon
						aria-hidden
						className="size-4 text-primary"
						weight="duotone"
					/>
					<h3 className="font-semibold text-foreground text-sm">Signals</h3>
				</div>
				{insights.length > 0 && (
					<span className="text-muted-foreground text-xs tabular-nums">
						{visibleCount} of {insights.length}{" "}
						{insights.length === 1 ? "signal" : "signals"}
					</span>
				)}
			</div>

			{showFilterBar && (
				<div className="flex items-center gap-2 border-b px-4 py-2">
					{websites.length > 1 && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									className="flex items-center gap-1.5 rounded px-2 py-1 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
									disabled={controlsLocked}
									type="button"
								>
									<span className="truncate">{selectedWebsiteName}</span>
									<CaretDownIcon className="size-3" weight="fill" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-[200px]">
								<DropdownMenuItem onClick={() => setWebsiteFilter("all")}>
									All Websites
								</DropdownMenuItem>
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

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								className={cn(
									"flex items-center gap-1.5 rounded px-2 py-1 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
								className="flex items-center gap-1.5 rounded px-2 py-1 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
								"text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
							className="ml-auto flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
								onFeedbackAction={(vote) => setFeedbackAction(insight.id, vote)}
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
		</section>
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
			className="flex h-10 shrink-0 items-center gap-2 border-b px-4"
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
				<Button
					onClick={onClearAction}
					size="sm"
					type="button"
					variant="outline"
				>
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
