"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../types";

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
			return "text-right";
		default:
			return "text-left";
	}
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
			<Card
				className={className ?? "gap-0 overflow-hidden border bg-card py-0"}
			>
				{title && (
					<div className="border-b px-3 py-2">
						<p className="font-medium text-sm">{title}</p>
						{description && (
							<p className="text-muted-foreground text-xs">{description}</p>
						)}
					</div>
				)}
				<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
					<p className="font-medium text-sm">No data available</p>
					<p className="text-muted-foreground text-xs">
						Data will appear once there is activity
					</p>
				</div>
			</Card>
		);
	}

	return (
		<Card className={className ?? "gap-0 overflow-hidden border bg-card py-0"}>
			{title && (
				<div className="border-b px-3 py-2">
					<p className="font-medium text-sm">{title}</p>
					{description && (
						<p className="text-muted-foreground text-xs">{description}</p>
					)}
				</div>
			)}
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b bg-muted/30">
							{columns.map((column) => (
								<th
									className={cn(
										"px-3 py-2 font-medium text-muted-foreground text-xs",
										getAlignmentClass(column.align)
									)}
									key={column.key}
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
									"border-b transition-colors last:border-b-0 hover:bg-muted/50",
									streaming &&
										rowIdx === rows.length - 1 &&
										"fade-in animate-in duration-300"
								)}
								key={rowIdx}
							>
								{columns.map((column, colIdx) => (
									<td
										className={cn(
											"px-3 py-2",
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
			{footer && (
				<div className="border-t bg-muted/30 px-3 py-1.5">
					<p className="text-muted-foreground text-xs">{footer}</p>
				</div>
			)}
		</Card>
	);
}
