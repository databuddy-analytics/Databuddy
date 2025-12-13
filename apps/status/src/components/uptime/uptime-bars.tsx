import dayjs from "dayjs";
import { barClassForUptime } from "@/lib/uptime";
import { cn } from "@/lib/utils";

export type UptimeBarDay = {
	date: string;
	uptime_percentage: number;
};

export function UptimeBars({ days }: { days: UptimeBarDay[] }) {
	if (days.length === 0) {
		return (
			<div className="rounded-none border bg-card p-4 text-muted-foreground text-sm">
				No uptime history yet.
			</div>
		);
	}

	return (
		<div className="rounded-none border bg-card p-4">
			<div className="mb-3 flex items-baseline justify-between gap-3">
				<div className="font-medium text-sm">Last 90 days</div>
				<div className="text-muted-foreground text-xs">Daily uptime</div>
			</div>
			<div className="flex flex-wrap gap-1" role="list">
				{days.map((day) => {
					const label = dayjs(day.date).format("YYYY-MM-DD");
					const percent = Number.isFinite(day.uptime_percentage)
						? day.uptime_percentage
						: null;

					const title =
						percent === null
							? `${label}: No data`
							: `${label}: ${percent.toFixed(2)}% uptime`;

					return (
						<div className="contents" key={day.date}>
							<span className="sr-only" role="listitem">
								{title}
							</span>
							<span
								aria-hidden="true"
								className={cn(
									"size-3 rounded-none border border-border/40",
									barClassForUptime(percent)
								)}
								title={title}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}
