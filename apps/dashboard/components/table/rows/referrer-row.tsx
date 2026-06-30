import type { CellContext, ColumnDef } from "@tanstack/react-table";
import {
	ReferrerSourceCell,
	type ReferrerSourceCellData,
} from "@/components/atomic/ReferrerSourceCell";
import { formatNumber } from "@/lib/formatters";
import { PercentageBadge } from "@databuddy/ui";

export interface ReferrerEntry extends ReferrerSourceCellData {
	clicks?: number;
	name: string;
	pageviews?: number;
	percentage: number;
	visitors?: number;
}

type ReferrerMetricKey = "clicks" | "pageviews" | "visitors";

interface ReferrerMetricColumn {
	header: string;
	id: ReferrerMetricKey;
}

interface ReferrerColumnOptions {
	metrics?: ReferrerMetricColumn[];
}

const DEFAULT_REFERRER_METRICS: ReferrerMetricColumn[] = [
	{ id: "visitors", header: "Visitors" },
	{ id: "pageviews", header: "Views" },
];

export function getReferrerDisplayValue(row: ReferrerSourceCellData): string {
	return row.name || row.source || row.referrer || "Direct";
}

export function getReferrerFilterValue(row: ReferrerSourceCellData): string {
	return row.referrer || row.source || row.name || "direct";
}

function createMetricColumn<TData extends ReferrerEntry>({
	id,
	header,
}: ReferrerMetricColumn): ColumnDef<TData, unknown> {
	return {
		id,
		accessorFn: (row) => row[id] ?? 0,
		header,
		cell: ({ getValue }: CellContext<TData, unknown>) => (
			<span className="font-medium text-foreground tabular-nums">
				{formatNumber(getValue() as number)}
			</span>
		),
	};
}

export function createReferrerColumns<
	TData extends ReferrerEntry = ReferrerEntry,
>({
	metrics = DEFAULT_REFERRER_METRICS,
}: ReferrerColumnOptions = {}): ColumnDef<TData, unknown>[] {
	return [
		{
			id: "name",
			accessorFn: getReferrerDisplayValue,
			header: "Source",
			cell: ({ row }: CellContext<TData, unknown>) => (
				<ReferrerSourceCell {...row.original} />
			),
		},
		...metrics.map(createMetricColumn<TData>),
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: ({ getValue }: CellContext<TData, unknown>) => {
				const percentage = getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
