"use client";

import { SpinnerIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { Fragment, useMemo } from "react";

type RetentionCohort = {
	cohort: string;
	users: number;
	week_0_retention: number;
	week_1_retention: number;
	week_2_retention: number;
	week_3_retention: number;
	week_4_retention: number;
	week_5_retention: number;
};

type RetentionCohortsGridProps = {
	cohorts: RetentionCohort[];
	isLoading: boolean;
};

const WEEK_COUNT = 6;
const OPACITY_MIN = 0.15;
const OPACITY_MAX = 0.85;
const OPACITY_RANGE = OPACITY_MAX - OPACITY_MIN;
const LOG_WEIGHT = 0.6;
const LINEAR_WEIGHT = 0.4;

type RetentionColor = {
	backgroundColor: string;
	textColor: string;
	className: string;
};

const getRetentionColor = (percentage: number | null): RetentionColor => {
	if (!percentage || Number.isNaN(percentage)) {
		return {
			backgroundColor: "transparent",
			textColor: "transparent",
			className: "bg-muted/30 text-muted-foreground/30",
		};
	}

	const linearScale = percentage / 100;
	const logScale = Math.log(percentage + 1) / Math.log(101);
	const blendedScale = logScale * LOG_WEIGHT + linearScale * LINEAR_WEIGHT;
	const opacity = OPACITY_MIN + blendedScale * OPACITY_RANGE;

	return {
		backgroundColor: `oklch(0.81 0.1 252 / ${opacity.toFixed(3)})`,
		textColor: "var(--color-foreground)",
		className: "",
	};
};

const formatCohortDate = (dateStr: string): string => {
	const date = dayjs(dateStr);
	const startDate = date.startOf("week");
	const endDate = date.endOf("week");

	return startDate.month() === endDate.month()
		? `${startDate.format("MMM D")} - ${endDate.format("D, YYYY")}`
		: `${startDate.format("MMM D")} - ${endDate.format("MMM D, YYYY")}`;
};

const getRetentionPercentages = (
	cohort: RetentionCohort
): (number | null)[] => [
	cohort.week_0_retention ?? 100,
	cohort.week_1_retention > 0 ? cohort.week_1_retention : null,
	cohort.week_2_retention > 0 ? cohort.week_2_retention : null,
	cohort.week_3_retention > 0 ? cohort.week_3_retention : null,
	cohort.week_4_retention > 0 ? cohort.week_4_retention : null,
	cohort.week_5_retention > 0 ? cohort.week_5_retention : null,
];

const headerCellClassName =
	"border-border border-b bg-card/80 px-4 py-3 text-center font-semibold text-foreground text-sm uppercase tracking-wide backdrop-blur-sm";

const cohortCellClassName =
	"sticky left-0 z-10 border-border border-r bg-card/50 px-4 py-3 text-sm backdrop-blur-sm";

export function RetentionCohortsGrid({
	cohorts,
	isLoading,
}: RetentionCohortsGridProps) {
	const sortedCohorts = useMemo(
		() =>
			[...cohorts].sort(
				(a, b) => dayjs(a.cohort).valueOf() - dayjs(b.cohort).valueOf()
			),
		[cohorts]
	);

	const periodHeaders = useMemo(
		() => Array.from({ length: WEEK_COUNT }, (_, i) => `Week ${i}`),
		[]
	);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<SpinnerIcon className="h-6 w-6 animate-spin" />
			</div>
		);
	}

	if (cohorts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<p className="text-muted-foreground text-sm">
					No retention data available for the selected time period
				</p>
			</div>
		);
	}

	return (
		<div className="w-full overflow-x-auto">
			<div
				className="w-full gap-px rounded border border-border bg-card shadow-sm"
				style={{
					display: "grid",
					gridTemplateColumns: `minmax(160px, 1fr) repeat(${WEEK_COUNT}, 1fr)`,
				}}
			>
				<div className={`sticky left-0 z-10 border-r ${headerCellClassName}`}>
					Cohort
				</div>
				{periodHeaders.map((header) => (
					<div className={headerCellClassName} key={header}>
						{header}
					</div>
				))}

				{sortedCohorts.map((cohort) => {
					const percentages = getRetentionPercentages(cohort);
					const dateRange = formatCohortDate(cohort.cohort);

					return (
						<Fragment key={cohort.cohort}>
							<div className={cohortCellClassName}>
								<div className="whitespace-nowrap font-medium text-foreground">
									{dateRange}
								</div>
								<div className="mt-1 whitespace-nowrap text-muted-foreground text-xs">
									{cohort.users.toLocaleString()} users
								</div>
							</div>

							{percentages.map((percentage, index) => {
								const { backgroundColor, textColor, className } =
									getRetentionColor(percentage);

								return (
									<div
										className={`m-1 flex h-12 items-center justify-center rounded text-center font-medium transition-all duration-200 ${className}`}
										key={`${cohort.cohort}-period-${index}`}
										style={
											backgroundColor && backgroundColor !== "transparent"
												? { backgroundColor, color: textColor }
												: undefined
										}
									>
										<span className="text-sm tabular-nums">
											{percentage !== null ? `${percentage.toFixed(1)}%` : "—"}
										</span>
									</div>
								);
							})}
						</Fragment>
					);
				})}
			</div>
		</div>
	);
}
