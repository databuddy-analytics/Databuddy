import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { formatNumber } from "@/lib/formatters";
import { PercentageBadge } from "@databuddy/ui";

export interface MetricEntry {
	name: string;
	pageviews?: number;
	percentage?: number;
	visitors: number;
}

interface MetricRowProps {
	includeName?: boolean;
	includePageviews?: boolean;
	nameLabel?: string;
	pageviewsLabel?: string;
	percentageLabel?: string;
	visitorsLabel?: string;
}

export function createMetricColumns({
	includeName = false,
	nameLabel = "Name",
	includePageviews = true,
	visitorsLabel = "Visitors",
	pageviewsLabel = "Pageviews",
	percentageLabel = "Share",
}: MetricRowProps = {}): ColumnDef<MetricEntry>[] {
	const columns: ColumnDef<MetricEntry>[] = [];

	if (includeName) {
		columns.push({
			id: "name",
			accessorKey: "name",
			header: nameLabel,
			cell: (info: CellContext<MetricEntry, any>) => {
				const name = (info.getValue() as string) || "";
				return (
					<span className="font-medium text-foreground" title={name}>
						{name}
					</span>
				);
			},
		});
	}

	columns.push({
		id: "visitors",
		accessorKey: "visitors",
		header: visitorsLabel,
		cell: (info: CellContext<MetricEntry, any>) => (
			<span className="font-medium">
				{formatNumber(info.getValue() as number)}
			</span>
		),
	});

	if (includePageviews) {
		columns.push({
			id: "pageviews",
			accessorKey: "pageviews",
			header: pageviewsLabel,
			cell: (info: CellContext<MetricEntry, any>) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		});
	}

	columns.push({
		id: "percentage",
		accessorKey: "percentage",
		header: percentageLabel,
		cell: (info: CellContext<MetricEntry, any>) => {
			const percentage = info.getValue() as number;
			return <PercentageBadge percentage={percentage} />;
		},
	});

	return columns;
}
