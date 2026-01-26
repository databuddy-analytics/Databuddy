"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/date-range-picker";
import { PageNavigation } from "@/components/layout/page-navigation";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useLink } from "@/hooks/use-links";

const MAX_HOURLY_DAYS = 7;

interface QuickRange {
	label: string;
	fullLabel: string;
	hours?: number;
	days?: number;
}

const QUICK_RANGES: QuickRange[] = [
	{ label: "24h", fullLabel: "Last 24 hours", hours: 24 },
	{ label: "7d", fullLabel: "Last 7 days", days: 7 },
	{ label: "30d", fullLabel: "Last 30 days", days: 30 },
	{ label: "90d", fullLabel: "Last 90 days", days: 90 },
];

const getStartDateForRange = (range: QuickRange) => {
	const now = new Date();
	return range.hours
		? dayjs(now).subtract(range.hours, "hour").toDate()
		: dayjs(now)
				.subtract(range.days ?? 7, "day")
				.toDate();
};

interface LinkStatsLayoutProps {
	children: React.ReactNode;
}

export default function LinkStatsLayout({ children }: LinkStatsLayoutProps) {
	const { id } = useParams();
	const linkId = id as string;
	const queryClient = useQueryClient();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const { activeOrganization } = useOrganizationsContext();

	const { data: link, isLoading: isLoadingLink } = useLink(
		linkId,
		activeOrganization?.id ?? ""
	);

	const {
		currentDateRange,
		currentGranularity,
		setCurrentGranularityAtomState,
		setDateRangeAction,
	} = useDateFilters();

	const dateRangeDays = useMemo(
		() =>
			dayjs(currentDateRange.endDate).diff(currentDateRange.startDate, "day"),
		[currentDateRange]
	);

	const isHourlyDisabled = dateRangeDays > MAX_HOURLY_DAYS;

	const selectedRange: DayPickerRange | undefined = useMemo(
		() => ({
			from: currentDateRange.startDate,
			to: currentDateRange.endDate,
		}),
		[currentDateRange]
	);

	const handleQuickRangeSelect = useCallback(
		(range: QuickRange) => {
			const start = getStartDateForRange(range);
			setDateRangeAction({ startDate: start, endDate: new Date() });
		},
		[setDateRangeAction]
	);

	const getGranularityButtonClass = (type: "daily" | "hourly") => {
		const isActive = currentGranularity === type;
		const baseClass =
			"h-full w-16 cursor-pointer touch-manipulation rounded-none px-0 text-xs";
		const activeClass = isActive
			? "font-medium bg-accent hover:bg-accent! text-accent-foreground"
			: "text-muted-foreground";
		return `${baseClass} ${activeClass}`.trim();
	};

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

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			await queryClient.invalidateQueries({
				predicate: (query) =>
					query.queryKey[0] === "batch-dynamic-query" &&
					query.queryKey.includes(linkId),
			});
			toast.success("Data refreshed");
		} catch {
			toast.error("Failed to refresh data");
		} finally {
			setIsRefreshing(false);
		}
	};

	useHotkeys(
		["1", "2", "3", "4"],
		(e) => {
			const index = Number.parseInt(e.key, 10) - 1;
			if (index >= 0 && index < QUICK_RANGES.length) {
				e.preventDefault();
				handleQuickRangeSelect(QUICK_RANGES[index]);
			}
		},
		{ preventDefault: true },
		[handleQuickRangeSelect]
	);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{isLoadingLink ? (
				<div className="box-border flex h-12 shrink-0 items-center gap-2 border-border border-b bg-accent/30 px-3">
					<Skeleton className="h-4 w-12" />
					<span className="text-muted-foreground/40">/</span>
					<Skeleton className="h-4 w-32" />
				</div>
			) : (
				<PageNavigation
					breadcrumb={{ label: "Links", href: "/links" }}
					className="h-12"
					currentPage={link?.name ?? "Link Stats"}
					variant="breadcrumb"
				/>
			)}

			<div className="sticky top-0 right-0 left-0 z-50 shrink-0 overscroll-contain bg-background md:top-0 md:left-84">
				<div className="flex h-10 items-center justify-between border-b pr-4">
					<div className="flex h-full items-center">
						<Button
							className={clsx(getGranularityButtonClass("daily"), "border-r")}
							onClick={() => setCurrentGranularityAtomState("daily")}
							title="View daily aggregated data"
							variant="ghost"
						>
							Daily
						</Button>
						<Button
							className={clsx(getGranularityButtonClass("hourly"), "border-r")}
							disabled={isHourlyDisabled}
							onClick={() => setCurrentGranularityAtomState("hourly")}
							title={
								isHourlyDisabled
									? `Hourly view is only available for ${MAX_HOURLY_DAYS} days or less`
									: `View hourly data (up to ${MAX_HOURLY_DAYS} days)`
							}
							variant="ghost"
						>
							Hourly
						</Button>

						{QUICK_RANGES.map((range) => {
							const isActive = isQuickRangeActive(range);
							return (
								<Button
									className={clsx(
										"h-full w-12 cursor-pointer touch-manipulation whitespace-nowrap rounded-none border-r px-0 font-medium text-xs",
										isActive
											? "bg-accent text-accent-foreground hover:bg-accent"
											: "hover:bg-accent!"
									)}
									key={range.label}
									onClick={() => handleQuickRangeSelect(range)}
									title={range.fullLabel}
									variant={isActive ? "secondary" : "ghost"}
								>
									{range.label}
								</Button>
							);
						})}

						<div className="flex h-full items-center pl-1">
							<DateRangePicker
								className="w-auto"
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
						</div>
					</div>

					<div className="flex items-center gap-2">
						<Button
							aria-label="Refresh data"
							className="size-8"
							disabled={isRefreshing}
							onClick={handleRefresh}
							variant="secondary"
						>
							<ArrowClockwiseIcon
								aria-hidden="true"
								className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
							/>
						</Button>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				{children}
			</div>
		</div>
	);
}
