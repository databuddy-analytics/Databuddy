import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatNumber } from "@/lib/formatters";

export interface PageEntry {
	name: string;
	pageviews: number;
	percentage: number;
	visitors: number;
}

export function createPageColumns(): ColumnDef<PageEntry>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Page",
			cell: ({ getValue }: CellContext<PageEntry, any>) => {
				const name = (getValue() as string) || "";
				return (
					<TruncatedText
						className="truncate font-medium text-foreground"
						text={name}
					/>
				);
			},
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: ({ getValue }: CellContext<PageEntry, any>) => (
				<span className="font-medium text-foreground">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: "pageviews",
			accessorKey: "pageviews",
			header: "Views",
			cell: ({ getValue }: CellContext<PageEntry, any>) => (
				<span className="font-medium text-foreground">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: ({ getValue }: CellContext<PageEntry, any>) => {
				const percentage = getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
