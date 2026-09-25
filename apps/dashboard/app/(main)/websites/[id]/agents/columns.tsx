"use client";

import { Badge } from "@databuddy/ui";
import { fromNow } from "@databuddy/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { formatNumber } from "@/lib/formatters";

export interface AgentPageRow {
	agents: number;
	ai_sessions: number;
	hits: number;
	name: string;
	on_demand: number;
	pageviews: number;
	search_index: number;
	training: number;
	verified_hits: number;
}

export interface AgentRow {
	hits: number;
	last_seen: string;
	name: string;
	pages: number;
	purpose: string;
	spoofed_hits: number;
	verified_hits: number;
}

const PURPOSE_LABELS: Record<string, string> = {
	training: "Training",
	search_index: "Search",
	user_fetch: "On demand",
	agent: "Agent",
};

function NumberCell({ value }: { value: number }) {
	return (
		<span className="text-[15px] text-muted-foreground tabular-nums">
			{formatNumber(value)}
		</span>
	);
}

function numberColumn<TRow>(
	key: keyof TRow & string,
	header: string
): ColumnDef<TRow> {
	return {
		id: key,
		accessorKey: key,
		header,
		cell: ({ getValue }) => <NumberCell value={(getValue() as number) ?? 0} />,
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
	numberColumn("hits", "Agent hits"),
	numberColumn("training", "Training"),
	numberColumn("search_index", "Search"),
	numberColumn("on_demand", "On demand"),
	numberColumn("pageviews", "Human views"),
	numberColumn("ai_sessions", "AI visits"),
];

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
	{
		id: "verification",
		accessorKey: "verified_hits",
		header: "Verification",
		cell: ({ row }) => {
			const { hits, verified_hits, spoofed_hits } = row.original;
			if (spoofed_hits > 0) {
				return (
					<Badge size="sm" variant="destructive">
						{formatNumber(spoofed_hits)} spoofed
					</Badge>
				);
			}
			if (verified_hits > 0) {
				return (
					<Badge size="sm" variant="success">
						{Math.round((verified_hits / Math.max(hits, 1)) * 100)}% verified
					</Badge>
				);
			}
			return (
				<Badge size="sm" variant="muted">
					Unverified
				</Badge>
			);
		},
	},
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
