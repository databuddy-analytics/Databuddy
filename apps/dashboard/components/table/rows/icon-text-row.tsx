import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { formatNumber } from "@/lib/formatters";

export interface IconTextEntry {
	name: string;
	pageviews?: number;
	percentage?: number;
	visitors: number;
}

interface IconTextRowProps {
	accessorKey?: string;
	getIcon: (name: string, entry?: IconTextEntry) => ReactNode;
	getSubtitle?: (entry: IconTextEntry) => string | undefined;
	header: string;
	includeMetrics?: boolean;
}

export function createIconTextColumns({
	header,
	accessorKey = "name",
	getIcon,
	getSubtitle,
	includeMetrics = true,
}: IconTextRowProps): ColumnDef<IconTextEntry>[] {
	const columns: ColumnDef<IconTextEntry>[] = [
		{
			id: accessorKey,
			accessorKey,
			header,
			cell: (info: CellContext<IconTextEntry, any>) => {
				const name = (info.getValue() as string) || "";
				const entry = info.row.original;
				const subtitle = getSubtitle?.(entry);

				return (
					<div className="flex items-center gap-3">
						{getIcon(name, entry)}
						<div>
							<div className="font-medium text-foreground">{name}</div>
							{subtitle && (
								<div className="text-muted-foreground text-xs">{subtitle}</div>
							)}
						</div>
					</div>
				);
			},
		},
	];

	if (includeMetrics) {
		columns.push(
			{
				id: "visitors",
				accessorKey: "visitors",
				header: "Visitors",
				cell: (info: CellContext<IconTextEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: "percentage",
				accessorKey: "percentage",
				header: "Share",
				cell: (info: CellContext<IconTextEntry, any>) => {
					const percentage = info.getValue() as number;
					return <PercentageBadge percentage={percentage} />;
				},
			}
		);
	}

	return columns;
}
