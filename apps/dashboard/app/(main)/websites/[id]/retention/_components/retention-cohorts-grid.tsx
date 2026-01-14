"use client";

import { SpinnerIcon, TableIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useMemo } from "react";
import { EmptyState } from "@/components/empty-state";

interface RetentionCohort {
	cohort: string;
	users: number;
	week_0_retention: number;
	week_1_retention: number;
	week_2_retention: number;
	week_3_retention: number;
	week_4_retention: number;
	week_5_retention: number;
}

interface RetentionCohortsGridProps {
	cohorts: RetentionCohort[];
	isLoading: boolean;
}

const WEEK_COUNT = 6;

interface RetentionColor {
	className: string;
}

const getRetentionColor = (percentage: number | null): RetentionColor => {
	if (!percentage || Number.isNaN(percentage)) {
		return { className: "bg-muted/20 text-muted-foreground/50" };
	}

	const normalizedPct = Math.min(percentage, 100) / 100;

	if (normalizedPct >= 0.7) {
		return { className: "bg-primary text-primary-foreground" };
	}
	if (normalizedPct >= 0.5) {
		return { className: "bg-primary/70 text-primary-foreground" };
	}
	if (normalizedPct >= 0.3) {
		return { className: "bg-primary/40 text-foreground" };
	}
	if (normalizedPct >= 0.1) {
		return { className: "bg-primary/20 text-foreground" };
	}
	return { className: "bg-primary/10 text-foreground" };
};

const formatCohortDate = (dateStr: string): string => {
	const date = dayjs(dateStr);
	return date.format("MMM D");
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

export function RetentionCohortsGrid({
	cohorts,
	isLoading,
}: RetentionCohortsGridProps) {
	const sortedCohorts = useMemo(
		() =>
			[...cohorts].sort(
				(a, b) => dayjs(b.cohort).valueOf() - dayjs(a.cohort).valueOf()
			),
		[cohorts]
	);

	const periodHeaders = useMemo(
		() => Array.from({ length: WEEK_COUNT }, (_, i) => `W${i}`),
		[]
	);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-16">
				<div className="flex flex-col items-center gap-3">
					<SpinnerIcon className="size-6 animate-spin text-primary" />
					<span className="text-muted-foreground text-sm">
						Loading cohorts...
					</span>
				</div>
			</div>
		);
	}

	if (cohorts.length === 0) {
		return (
			<EmptyState
				description="No retention data available for the selected time period"
				icon={<TableIcon className="text-muted-foreground" weight="duotone" />}
				title="No cohort data"
				variant="minimal"
			/>
		);
	}

	return (
		<div className="w-full overflow-x-auto">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="border-border border-b">
						<th className="w-20 bg-accent px-2 py-2.5 text-left font-semibold text-foreground text-xs uppercase">
							Cohort
						</th>
						<th className="w-16 bg-accent px-2 py-2.5 text-right font-semibold text-foreground text-xs uppercase">
							Users
						</th>
						{periodHeaders.map((header) => (
							<th
								className="min-w-[60px] flex-1 bg-accent px-2 py-2.5 text-center font-semibold text-foreground text-xs uppercase"
								key={header}
							>
								{header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{sortedCohorts.map((cohort, rowIndex) => {
						const percentages = getRetentionPercentages(cohort);
						const dateLabel = formatCohortDate(cohort.cohort);

						return (
							<tr
								className={`hover:bg-accent ${
									rowIndex !== sortedCohorts.length - 1
										? "border-border border-b"
										: ""
								}`}
								key={cohort.cohort}
							>
								<td className="whitespace-nowrap bg-accent px-2 py-2">
									<span className="font-medium text-foreground text-xs">
										{dateLabel}
									</span>
								</td>
								<td className="whitespace-nowrap px-2 py-2 text-right">
									<span className="font-medium text-foreground text-xs tabular-nums">
										{cohort.users.toLocaleString()}
									</span>
								</td>
								{percentages.map((percentage, index) => {
									const { className } = getRetentionColor(percentage);

									return (
										<td
											className="px-1 py-1"
											key={`${cohort.cohort}-week-${index}`}
										>
											<div
												className={`flex h-8 items-center justify-center rounded font-medium text-xs tabular-nums ${className}`}
											>
												{percentage !== null
													? `${percentage.toFixed(0)}%`
													: "—"}
											</div>
										</td>
									);
								})}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
