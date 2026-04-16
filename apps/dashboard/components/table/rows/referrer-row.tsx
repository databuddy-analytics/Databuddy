import type { CellContext, ColumnDef } from "@tanstack/react-table";
import {
	ReferrerSourceCell,
	type ReferrerSourceCellData,
} from "@/components/atomic/ReferrerSourceCell";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { formatNumber } from "@/lib/formatters";

export interface ReferrerEntry extends ReferrerSourceCellData {
	pageviews: number;
	percentage: number;
	visitors: number;
}

export function createReferrerColumns(): ColumnDef<ReferrerEntry>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Source",
			cell: ({ row }: CellContext<ReferrerEntry, any>) => (
				<ReferrerSourceCell {...row.original} />
			),
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: ({ getValue }: CellContext<ReferrerEntry, any>) => (
				<span className="font-medium text-foreground">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: "pageviews",
			accessorKey: "pageviews",
			header: "Views",
			cell: ({ getValue }: CellContext<ReferrerEntry, any>) => (
				<span className="font-medium text-foreground">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: ({ getValue }: CellContext<ReferrerEntry, any>) => {
				const percentage = getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
