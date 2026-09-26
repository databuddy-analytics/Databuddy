"use client";

import { Badge } from "@databuddy/ui";
import { fromNow } from "@databuddy/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { formatNumber } from "@/lib/formatters";

export interface AgentPageRow {
	ai_sessions: number;
	hits: number;
	name: string;
	on_demand: number;
	pageviews: number;
	search_index: number;
	training: number;
}

export interface AgentRow {
	hits: number;
	last_seen: string;
	name: string;
	pages: number;
	purpose: string;
}

type PurposeKey = "training" | "search_index" | "on_demand";

export const PURPOSES: { key: PurposeKey; label: string }[] = [
	{ key: "training", label: "Training" },
	{ key: "search_index", label: "Search" },
	{ key: "on_demand", label: "On demand" },
];

const PURPOSE_LABELS: Record<string, string> = {
	training: "Training",
	search_index: "Search",
	user_fetch: "On demand",
	agent: "Agent",
};

function numberColumn<TRow>(
	key: keyof TRow & string,
	header: string
): ColumnDef<TRow> {
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

export function pageColumns(rows: AgentPageRow[]): ColumnDef<AgentPageRow>[] {
	return [
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
		numberColumn("hits", "Agent hits"),
		...PURPOSES.filter(({ key }) => rows.some((row) => row[key] > 0)).map(
			({ key, label }) => numberColumn<AgentPageRow>(key, label)
		),
		numberColumn("pageviews", "Human views"),
		numberColumn("ai_sessions", "AI visits"),
	];
}

export const agentColumns: ColumnDef<AgentRow>[] = [
	{
		id: "name",
		accessorKey: "name",
		header: "Agent",
		cell: ({ row }) => (
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate font-medium text-[15px]">
					{row.original.name}
				</span>
				<Badge size="sm" variant="muted">
					{PURPOSE_LABELS[row.original.purpose] ?? "Unclassified"}
				</Badge>
			</div>
		),
	},
	numberColumn("hits", "Hits"),
	numberColumn("pages", "Pages"),
	{
		id: "last_seen",
		accessorKey: "last_seen",
		header: "Last seen",
		cell: ({ getValue }) => (
			<span className="text-[15px] text-muted-foreground">
				{fromNow(getValue() as string)}
			</span>
		),
	},
];
