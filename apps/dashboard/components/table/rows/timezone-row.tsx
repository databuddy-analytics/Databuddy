import { ClockIcon } from "@phosphor-icons/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import dayjs from "@/lib/dayjs";
import { formatNumber } from "@/lib/formatters";

export interface TimezoneEntry {
	name: string;
	pageviews: number;
	percentage: number;
	visitors: number;
}

export function createTimezoneColumns(): ColumnDef<TimezoneEntry>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Timezone",
			cell: (info: CellContext<TimezoneEntry, any>) => {
				const entry = info.row.original;
				const timezoneName = entry.name;
				return (
					<div className="flex items-center gap-2">
						<ClockIcon className="size-4 text-primary" />
						<div>
							<div className="font-medium">{timezoneName}</div>
						</div>
					</div>
				);
			},
		},
		{
			id: "current_time",
			header: "Current Time",
			cell: (info: CellContext<TimezoneEntry, any>) => {
				const entry = info.row.original;
				const timezoneName = entry.name;
				let currentTime = "-";
				try {
					if (timezoneName) {
						currentTime = dayjs().tz(timezoneName).format("hh:mm A");
					}
				} catch {}
				return <span className="font-mono text-xs">{currentTime}</span>;
			},
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: (info: CellContext<TimezoneEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: "pageviews",
			accessorKey: "pageviews",
			header: "Pageviews",
			cell: (info: CellContext<TimezoneEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: (info: CellContext<TimezoneEntry, any>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
