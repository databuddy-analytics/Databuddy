"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useAtom, useSetAtom } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useCallback, useEffect } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { LiveUserIndicator } from "@/components/analytics";
import { DateRangePicker } from "@/components/date-range-picker";
import { TopBar } from "@/components/layout/top-bar";
import { WebsiteErrorState } from "@/components/website-error-state";
import { useDateFilters } from "@/hooks/use-date-filters";
import {
	batchDynamicQueryKeys,
	dynamicQueryKeys,
} from "@/hooks/use-dynamic-query";
import { useWebsite } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import {
	addDynamicFilterAtom,
	currentFilterWebsiteIdAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";
import { AddFilterForm } from "./_components/filters/add-filters";
import { FiltersSection } from "./_components/filters/filters-section";
import { SavedFiltersToolbar } from "./_components/filters/saved-filters-toolbar";
import { WebsiteTrackingSetupTab } from "./_components/tabs/tracking-setup-tab";
import { useTrackingSetup } from "./hooks/use-tracking-setup";
import { ArrowClockwiseIcon } from "@databuddy/ui/icons";
import { Button, SegmentedControl, dayjs } from "@databuddy/ui";

const NO_TOOLBAR_ROUTES = [
	"/assistant",
	"/map",
	"/flags",
	"/databunny",
	"/settings",
	"/users",
	"/agent",
	"/pulse",
];

const MAX_HOURLY_DAYS = 7;

interface QuickRange {
	days?: number;
	fullLabel: string;
	hours?: number;
	label: string;
}

const QUICK_RANGES: QuickRange[] = [
	{ label: "24h", fullLabel: "Last 24 hours", hours: 24 },
	{ label: "7d", fullLabel: "Last 7 days", days: 7 },
	{ label: "30d", fullLabel: "Last 30 days", days: 30 },
	{ label: "90d", fullLabel: "Last 90 days", days: 90 },
	{ label: "180d", fullLabel: "Last 180 days", days: 180 },
	{ label: "365d", fullLabel: "Last 365 days", days: 365 },
];

const GRANULARITY_OPTIONS = [
	{ label: "Daily", value: "daily" as const },
	{ label: "Hourly", value: "hourly" as const },
];

const getStartDateForRange = (range: QuickRange) => {
	const now = new Date();
	return range.hours
		? dayjs(now).subtract(range.hours, "hour").toDate()
		: dayjs(now)
				.subtract(range.days ?? 7, "day")
				.toDate();
};

interface WebsiteLayoutProps {
	children: React.ReactNode;
}

export default function WebsiteLayout({ children }: WebsiteLayoutProps) {
	const { id } = useParams();
	const websiteId = id as string;
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const setCurrentFilterWebsiteId = useSetAtom(currentFilterWebsiteIdAtom);
	const [isEmbed] = useQueryState("embed", parseAsBoolean.withDefault(false));
	const [, addFilter] = useAtom(addDynamicFilterAtom);

	const {
		currentDateRange,
		currentGranularity,
		setCurrentGranularityAtomState,
		setDateRangeAction,
	} = useDateFilters();

	useEffect(() => {
		setCurrentFilterWebsiteId(websiteId);
	}, [websiteId, setCurrentFilterWebsiteId]);

	const isDemoRoute = pathname?.startsWith("/demo/");
	const hideToolbar =
		isEmbed || NO_TOOLBAR_ROUTES.some((route) => pathname.includes(route));

	const {
		data: websiteData,
		isLoading: isWebsiteLoading,
		isError: isWebsiteError,
		error: websiteError,
	} = useWebsite(websiteId);

	const { isTrackingSetup, isTrackingSetupLoading } =
		useTrackingSetup(websiteId);

	if (!id) {
		return <WebsiteErrorState error={{ data: { code: "NOT_FOUND" } }} />;
	}

	if (!isWebsiteLoading && isWebsiteError) {
		return <WebsiteErrorState error={websiteError} websiteId={websiteId} />;
	}

	const isToolbarLoading =
		isWebsiteLoading ||
		(!isDemoRoute && (isTrackingSetupLoading || isTrackingSetup === null));

	const isToolbarDisabled =
		!isDemoRoute && (!isTrackingSetup || isToolbarLoading);

	const showTrackingSetup =
		!(isDemoRoute || isTrackingSetupLoading) &&
		websiteData &&
		isTrackingSetup === false;

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["websites", id] }),
				queryClient.invalidateQueries({
					queryKey: ["websites", "isTrackingSetup", id],
				}),
				queryClient.invalidateQueries({
					queryKey: dynamicQueryKeys.byWebsite(websiteId),
				}),
				queryClient.invalidateQueries({
					queryKey: batchDynamicQueryKeys.byWebsite(websiteId),
				}),
			]);
		} catch {
			toast.error("Failed to refresh data");
		}
		setIsRefreshing(false);
	};

	const dateRangeDays = dayjs(currentDateRange.endDate).diff(
		currentDateRange.startDate,
		"day"
	);
	const isHourlyDisabled = dateRangeDays > MAX_HOURLY_DAYS;

	const selectedRange: DayPickerRange = {
		from: currentDateRange.startDate,
		to: currentDateRange.endDate,
	};

	const handleQuickRangeSelect = useCallback(
		(range: QuickRange) => {
			const start = getStartDateForRange(range);
			setDateRangeAction({ startDate: start, endDate: new Date() });
		},
		[setDateRangeAction]
	);

	const isQuickRangeActive = useCallback(
		(range: QuickRange) => {
			if (!(selectedRange?.from && selectedRange?.to)) {
				return false;
			}
			const now = new Date();
			const start = getStartDateForRange(range);
			return (
				dayjs(selectedRange.from).isSame(start, "day") &&
				dayjs(selectedRange.to).isSame(now, "day")
			);
		},
		[selectedRange]
	);

	useHotkeys(
		["1", "2", "3", "4", "5", "6"],
		(e) => {
			if (isToolbarDisabled) {
				return;
			}
			const index = Number.parseInt(e.key, 10) - 1;
			if (index >= 0 && index < QUICK_RANGES.length) {
				e.preventDefault();
				handleQuickRangeSelect(QUICK_RANGES[index]);
			}
		},
		{ preventDefault: true, enabled: !isToolbarDisabled },
		[isToolbarDisabled, handleQuickRangeSelect]
	);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{!hideToolbar && (
				<>
					<TopBar.Title>
						<SegmentedControl
							disabled={isToolbarDisabled || isHourlyDisabled}
							onChange={(v) => setCurrentGranularityAtomState(v)}
							options={GRANULARITY_OPTIONS}
							size="sm"
							value={currentGranularity}
						/>

						<div className="flex h-8 items-center gap-0.5 rounded-md bg-sidebar-accent p-0.5">
							{QUICK_RANGES.map((range) => {
								const isActive = isQuickRangeActive(range);
								return (
									<Button
										className={cn(
											"h-6 px-2 text-[11px] text-sidebar-foreground/60 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
											isActive &&
												"bg-sidebar text-sidebar-foreground shadow-xs hover:bg-sidebar"
										)}
										disabled={isToolbarDisabled}
										key={range.label}
										onClick={() => handleQuickRangeSelect(range)}
										size="sm"
										title={range.fullLabel}
										variant="ghost"
									>
										{range.label}
									</Button>
								);
							})}
						</div>

						<DateRangePicker
							className="w-auto"
							disabled={isToolbarDisabled}
							maxDate={new Date()}
							minDate={new Date(2020, 0, 1)}
							onChange={(range) => {
								if (range?.from && range?.to) {
									setDateRangeAction({
										startDate: range.from,
										endDate: range.to,
									});
								}
							}}
							value={selectedRange}
						/>
					</TopBar.Title>

					<TopBar.Actions>
						<AddFilterForm
							addFilter={addFilter}
							buttonText="Filter"
							disabled={isToolbarDisabled}
						/>
						<SavedFiltersToolbar />
						<LiveUserIndicator websiteId={websiteId} />
						<Button
							aria-label="Refresh data"
							disabled={isRefreshing || isToolbarDisabled}
							onClick={handleRefresh}
							size="sm"
							variant="secondary"
						>
							<ArrowClockwiseIcon
								aria-hidden
								className={cn(
									"size-4 shrink-0",
									isRefreshing || isToolbarLoading ? "animate-spin" : ""
								)}
							/>
						</Button>
					</TopBar.Actions>

					{!isToolbarDisabled && <FiltersSection />}
				</>
			)}

			{hideToolbar ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					{children}
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					{showTrackingSetup ? (
						<div className="p-4">
							<WebsiteTrackingSetupTab websiteId={websiteId} />
						</div>
					) : (
						children
					)}
				</div>
			)}
		</div>
	);
}
