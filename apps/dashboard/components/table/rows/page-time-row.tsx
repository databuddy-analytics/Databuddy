import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { formatNumber } from "@/lib/formatters";

export interface PageTimeEntry {
	median_time_on_page: number;
	name: string;
	percentage: number;
	sessions_with_time: number;
	visitors: number;
}

const formatTimeSeconds = (seconds: number): string => {
	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);
	return `${minutes}m ${remainingSeconds}s`;
};

export function createPageTimeColumns(): ColumnDef<PageTimeEntry>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Page",
			cell: (info: CellContext<PageTimeEntry, any>) => {
				const name = (info.getValue() as string) || "";
				return (
					<span className="font-medium text-foreground" title={name}>
						{name}
					</span>
				);
			},
		},
		{
			id: "median_time_on_page",
			accessorKey: "median_time_on_page",
			header: "Avg Time",
			cell: (info: CellContext<PageTimeEntry, any>) => {
				const seconds = (info.getValue() as number) ?? 0;
				return (
					<div className="flex items-center gap-2">
						<span className="font-medium text-foreground">
							{formatTimeSeconds(seconds)}
						</span>
					</div>
				);
			},
		},
		{
			id: "sessions_with_time",
			accessorKey: "sessions_with_time",
			header: "Sessions",
			cell: (info: CellContext<PageTimeEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: (info: CellContext<PageTimeEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: (info: CellContext<PageTimeEntry, any>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
