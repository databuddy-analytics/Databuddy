"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AiProductIcon } from "@/components/icon";
import { formatNumber } from "@/lib/formatters";

export interface AgentPageRow {
	name: string;
	pageviews: number;
	products: string[];
	requests: number;
	visitors: number;
}

function numberColumn(
	key: "requests" | "pageviews" | "visitors",
	header: string
): ColumnDef<AgentPageRow> {
	return {
		id: key,
		accessorKey: key,
		header,
		cell: ({ getValue }) => (
			<span className="text-[15px] text-muted-foreground tabular-nums">
				{formatNumber((getValue() as number) ?? 0)}
			</span>
		),
	};
}

export const pageColumns: ColumnDef<AgentPageRow>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Page",
		cell: ({ getValue }) => (
			<span className="truncate font-medium text-[15px]">
				{getValue() as string}
			</span>
		),
	},
	{
		id: "products",
		accessorKey: "products",
		header: "Read by",
		cell: ({ row }) => (
			<div className="flex items-center gap-1">
				{row.original.products.map((product) => (
					<span key={product} title={product}>
						<AiProductIcon name={product} size="sm" />
					</span>
				))}
			</div>
		),
	},
	numberColumn("requests", "AI requests"),
	numberColumn("pageviews", "Human views"),
	numberColumn("visitors", "AI visitors"),
];
