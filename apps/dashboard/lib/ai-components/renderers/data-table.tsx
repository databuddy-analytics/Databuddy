"use client";

import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../types";
import { FunnelIcon, TableIcon } from "@databuddy/ui/icons";
import { Badge, Card } from "@databuddy/ui";

export interface DataTableColumn {
	align?: "left" | "center" | "right";
	header: string;
	key: string;
}

export interface DataTableProps extends BaseComponentProps {
	columns: DataTableColumn[];
	description?: string;
	footer?: string;
	rows: Record<string, string | number | boolean | null>[];
	title?: string;
}

function formatCellValue(value: string | number | boolean | null): string {
	if (value === null || value === undefined) {
		return "-";
	}
	if (typeof value === "boolean") {
		return value ? "Yes" : "No";
	}
	if (typeof value === "number") {
		return Intl.NumberFormat(undefined, {
			notation: value > 9999 ? "compact" : "standard",
			maximumFractionDigits: 1,
		}).format(value);
	}
	return String(value);
}

function getAlignmentClass(align?: "left" | "center" | "right"): string {
	switch (align) {
		case "center":
			return "text-center";
		case "right":
			return "text-right text-balance";
		default:
			return "text-left";
	}
}

const DATA_TABLE_CARD_CLASS =
	"gap-0 overflow-hidden py-0 border-0 bg-secondary p-1";

function DataTableHeaderBlock({
	title,
	description,
	rowCount,
}: {
	description?: string;
	rowCount: number;
	title?: string;
}) {
	if (!(title || description)) {
		return null;
	}
	const rowLabel = rowCount === 1 ? "1 row" : `${rowCount} rows`;
	return (
		<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
			<div className="flex size-6 shrink-0 items-center justify-center rounded bg-accent mb-auto">
				<FunnelIcon
					className="size-3.5 text-muted-foreground"
					weight="duotone"
				/>
			</div>
			<div className="min-w-0 flex-1">
				{title ? (
					<p className="text-pretty font-medium text-sm">{title}</p>
				) : null}
				{description ? (
					<p className="mt-0.5 text-pretty text-muted-foreground text-xs">
						{description}
					</p>
				) : null}
			</div>
			<Badge className="shrink-0 rounded text-[10px]" variant="muted">
				{rowLabel}
			</Badge>
		</div>
	);
}

export function DataTableRenderer({
	title,
	description,
	columns,
	rows,
	footer,
	className,
	streaming,
}: DataTableProps) {
	if (rows.length === 0) {
		return (
			<Card className={cn(DATA_TABLE_CARD_CLASS, className)}>
				<div className="flex flex-col gap-1">
					<DataTableHeaderBlock
						description={description}
						rowCount={0}
						title={title}
					/>
					<div className="rounded-md bg-background px-3 py-8 text-center">
						<p className="text-pretty font-medium text-sm">No data available</p>
						<p className="text-pretty text-muted-foreground text-xs">
							Data will appear once there is activity
						</p>
					</div>
				</div>
			</Card>
		);
	}

	return (
		<Card className={cn(DATA_TABLE_CARD_CLASS, className)}>
			<div className="flex flex-col gap-1">
				<DataTableHeaderBlock
					description={description}
					rowCount={rows.length}
					title={title}
				/>
				<div className="overflow-x-auto rounded-md bg-background p-1">
					<table className="w-full text-sm">
						<thead>
							<tr className="">
								{columns.map((column) => (
									<th
										className={cn(
											"px-3 py-2 font-medium text-muted-foreground text-xs",
											getAlignmentClass(column.align)
										)}
										key={column.key}
										scope="col"
									>
										{column.header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, rowIdx) => (
								<tr
									className={cn(
										"border-background border-b-2 transition-colors last:border-b-0 hover:bg-muted/50",
										streaming &&
											rowIdx === rows.length - 1 &&
											"fade-in animate-in duration-200"
									)}
									key={rowIdx}
								>
									{columns.map((column, colIdx) => (
										<td
											className={cn(
												"text-pretty px-3 py-2 bg-muted/30 first:rounded-l-sm last:rounded-r-sm ",
												getAlignmentClass(column.align),
												colIdx === 0 ? "font-medium" : "tabular-nums"
											)}
											key={column.key}
										>
											{formatCellValue(row[column.key])}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{footer ? (
					<div className="rounded-md bg-background">
						<div className="px-2.5 py-2">
							<p className="text-pretty text-muted-foreground text-xs">
								{footer}
							</p>
						</div>
					</div>
				) : null}
			</div>
		</Card>
	);
}