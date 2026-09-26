"use client";

import { fromNow } from "@databuddy/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { AiProductIcon } from "@/components/icon";
import { formatNumber } from "@/lib/formatters";

export interface ProductRow {
	last_seen: string;
	on_demand: number;
	pages: number;
	product: string;
	requests: number;
	search_index: number;
	training: number;
	visitors: number;
}

export const NEVER_SEEN = "1970";

export const FORMAT_LABELS: Record<string, string> = {
	html: "HTML",
	llms: "llms.txt",
	markdown: "Markdown",
};

export interface AgentPageRow {
	format: string | null;
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
	numberColumn("visitors", "AI visitors"),
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
	{
		id: "format",
		accessorKey: "format",
		header: "Format",
		cell: ({ getValue }) => {
			const format = getValue() as string | null;
			return (
				<span className="text-[15px] text-muted-foreground">
					{format ? (FORMAT_LABELS[format] ?? format) : ""}
				</span>
			);
		},
	},
	numberColumn("pageviews", "Human views"),
];

function productNumberColumn(
	key: "requests" | "pages" | "visitors",
	header: string
): ColumnDef<ProductRow & { name: string }> {
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

export const otherProductColumns: ColumnDef<ProductRow & { name: string }>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Product",
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-2">
				<AiProductIcon name={row.original.name} size="sm" />
				<span className="truncate font-medium text-[15px]">
					{row.original.name}
				</span>
			</div>
		),
	},
	productNumberColumn("requests", "Requests"),
	productNumberColumn("pages", "Pages read"),
	productNumberColumn("visitors", "Visitors sent"),
	{
		id: "last_seen",
		accessorKey: "last_seen",
		header: "Last read",
		cell: ({ getValue }) => {
			const value = getValue() as string;
			return (
				<span className="text-[15px] text-muted-foreground">
					{value.startsWith(NEVER_SEEN) ? "Never" : fromNow(value)}
				</span>
			);
		},
	},
];
