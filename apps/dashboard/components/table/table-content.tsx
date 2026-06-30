import { flexRender, type Table } from "@tanstack/react-table";
import type React from "react";
import { Fragment, memo, useCallback, useState } from "react";
import {
	TableBody,
	TableCell,
	Table as TableComponent,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TableEmptyState } from "./table-empty-state";
import {
	CaretDownIcon,
	CaretRightIcon,
	DatabaseIcon,
} from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";

const DEFAULT_SHARE_COLUMN_TITLE =
	"Share of unique visitors in this breakdown. Row percentages may add up to more than 100% when the same user appears in multiple rows.";

function resolveShareColumnTitle(
	columnId: string,
	shareColumnTooltip: string | undefined
): string | undefined {
	if (columnId !== "percentage") {
		return;
	}
	if (shareColumnTooltip !== undefined) {
		return shareColumnTooltip.length > 0 ? shareColumnTooltip : undefined;
	}
	return DEFAULT_SHARE_COLUMN_TITLE;
}

const DEFAULT_CELL_STYLE = {
	minWidth: "180px",
} as const;

const COMPACT_COLUMN_WIDTHS: Record<string, number> = {
	clicks: 88,
	cls: 76,
	current_time: 108,
	customers: 100,
	fcp: 88,
	fps: 88,
	inp: 88,
	lcp: 88,
	median_time_on_page: 112,
	pageviews: 96,
	percentage: 96,
	revenue: 112,
	samples: 88,
	sessions: 96,
	sessions_with_time: 116,
	total_clicks: 96,
	transactions: 116,
	ttfb: 96,
	unique_links: 92,
	unique_users: 96,
	visitors: 96,
};

const COMPACT_COLUMN_MATCHERS = [
	/_(clicks|customers|revenue|sessions|users|views)$/,
	/^(clicks|customers|revenue|sessions|users|views)$/,
] as const;

const cellStyleCache = new Map<string, React.CSSProperties>();

function getCompactColumnWidth(columnId: string): number | undefined {
	return (
		COMPACT_COLUMN_WIDTHS[columnId] ??
		(COMPACT_COLUMN_MATCHERS.some((matcher) => matcher.test(columnId))
			? 96
			: undefined)
	);
}

function getColumnStyle(columnId: string, size: number): React.CSSProperties {
	const compactWidth = getCompactColumnWidth(columnId);

	if (compactWidth !== undefined) {
		const cacheKey = `compact-${compactWidth}`;
		const cached = cellStyleCache.get(cacheKey);
		if (cached) {
			return cached;
		}
		const style = {
			maxWidth: `${compactWidth}px`,
			minWidth: `${compactWidth}px`,
			width: `${compactWidth}px`,
		} as const;
		cellStyleCache.set(cacheKey, style);
		return style;
	}

	if (size === 150) {
		return DEFAULT_CELL_STYLE;
	}

	const flexibleMinWidth = Math.max(180, Math.min(size, 360));
	const cacheKey = `flex-${flexibleMinWidth}`;
	const cached = cellStyleCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const style = {
		minWidth: `${flexibleMinWidth}px`,
	} as const;

	cellStyleCache.set(cacheKey, style);
	return style;
}

interface PercentageRow {
	percentage?: string | number;
}

function getRowPercentage(row: PercentageRow): number {
	const value = row.percentage;
	if (value === undefined) {
		return 0;
	}
	const parsed = Number.parseFloat(String(value)) || 0;
	return Math.max(0, Math.min(100, parsed));
}

function getShareBarStyle(percentage: number): React.CSSProperties | undefined {
	if (percentage <= 0) {
		return;
	}
	const solidEnd = Math.max(0, percentage - 6);
	const softEnd = Math.min(100, percentage + 2);
	const fadeEnd = Math.min(100, percentage + 8);
	return {
		backgroundImage: `linear-gradient(to right, color-mix(in oklab, var(--primary) 10%, transparent) 0%, color-mix(in oklab, var(--primary) 10%, transparent) ${solidEnd}%, color-mix(in oklab, var(--primary) 4%, transparent) ${softEnd}%, transparent ${fadeEnd}%)`,
	};
}

interface TableContentProps<TData extends { name: string | number }> {
	activeTab?: string;
	className?: string;
	emptyMessage?: string;
	expandable?: boolean;
	getSubRows?: (row: TData) => TData[] | undefined;
	minHeight?: string | number;
	onAddFilter?: (field: string, value: string, tableTitle?: string) => void;
	onRowAction?: (row: TData) => void;
	onRowClick?: (field: string, value: string | number) => void;
	renderSubRow?: (
		subRow: TData,
		parentRow: TData,
		index: number
	) => React.ReactNode;
	shareColumnTooltip?: string;
	table: Table<TData>;
	tabs?: any[];
	title?: string;
}

function TableContentInner<TData extends { name: string | number }>({
	table,
	title,
	minHeight = 200,
	expandable = false,
	getSubRows,
	renderSubRow,
	onAddFilter,
	onRowAction,
	onRowClick,
	tabs,
	activeTab,
	emptyMessage = "No data available",
	className,
	shareColumnTooltip,
}: TableContentProps<TData>) {
	const [expandedRow, setExpandedRow] = useState<string | null>(null);

	const toggleRowExpansion = useCallback((rowId: string) => {
		setExpandedRow((prev) => (prev === rowId ? null : rowId));
	}, []);

	const displayData = table.getRowModel().rows;
	const headerGroups = table.getHeaderGroups();
	const activeTabConfig = tabs?.find((tab) => tab.id === activeTab);
	const isInteractive = !!(onRowClick || onAddFilter || onRowAction);

	const handleRowClick = (row: TData, hasSubRows: boolean, rowId: string) => {
		if (hasSubRows) {
			toggleRowExpansion(rowId);
			return;
		}
		if (onRowAction) {
			onRowAction(row);
			return;
		}
		if (onAddFilter && row.name && activeTabConfig?.getFilter) {
			const { field, value } = activeTabConfig.getFilter(row);
			onAddFilter(field, value, title);
			return;
		}
		if (onRowClick) {
			onRowClick("name", row.name);
		}
	};

	if (!displayData.length) {
		return (
			<div
				className="flex items-center justify-center"
				style={{ height: minHeight }}
			>
				<TableEmptyState
					description="Data will appear here when available and ready to display."
					icon={<DatabaseIcon />}
					title={emptyMessage}
				/>
			</div>
		);
	}

	return (
		<div
			aria-labelledby={`tab-${activeTab}`}
			className={cn("table-scrollbar relative overflow-auto", className)}
			id={`tabpanel-${activeTab}`}
			role="tabpanel"
			style={{ height: minHeight }}
		>
			<TableComponent className="w-full table-fixed" key={`table-${activeTab}`}>
				<TableHeader>
					{headerGroups.map((headerGroup) => (
						<TableRow
							className="sticky top-0 z-10 border-b bg-card hover:bg-card"
							key={headerGroup.id}
						>
							{headerGroup.headers.map((header) => {
								const isCompactColumn =
									getCompactColumnWidth(header.column.id) !== undefined;

								return (
									<TableHead
										className={cn(
											"h-8 px-3 font-medium text-muted-foreground text-xs",
											isCompactColumn && "px-3 text-right",
											(header.column.columnDef.meta as any)?.className
										)}
										key={header.id}
										style={getColumnStyle(header.column.id, header.getSize())}
										title={resolveShareColumnTitle(
											header.column.id,
											shareColumnTooltip
										)}
									>
										<span
											className={cn(
												"block truncate",
												isCompactColumn && "text-right"
											)}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext()
													)}
										</span>
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{displayData.map((row) => {
						const subRows =
							expandable && getSubRows ? getSubRows(row.original) : undefined;
						const hasSubRows = !!subRows?.length;
						const percentage = getRowPercentage(row.original as PercentageRow);
						const isExpanded = expandedRow === row.id;
						const canActivate = isInteractive || hasSubRows;
						const shareBarStyle = getShareBarStyle(percentage);

						return (
							<Fragment key={row.id}>
								<TableRow
									className={cn(
										"group border-border/60 border-b bg-card transition-[background-color,box-shadow] duration-150 last:border-b-0 hover:bg-accent-brighter/70 hover:shadow-[inset_0_1px_0_var(--border),inset_0_-1px_0_var(--border)]",
										isExpanded &&
											"bg-accent-brighter shadow-[inset_0_1px_0_var(--border),inset_0_-1px_0_var(--border)] hover:bg-accent-brighter",
										canActivate &&
											"cursor-pointer focus-visible:bg-interactive-hover/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
									)}
									data-state={isExpanded ? "expanded" : undefined}
									onClick={() =>
										handleRowClick(row.original, hasSubRows, row.id)
									}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											e.currentTarget.click();
											return;
										}
										if (e.key === "ArrowDown" || e.key === "j") {
											e.preventDefault();
											const next = e.currentTarget
												.nextElementSibling as HTMLElement | null;
											next?.focus();
											return;
										}
										if (e.key === "ArrowUp" || e.key === "k") {
											e.preventDefault();
											const prev = e.currentTarget
												.previousElementSibling as HTMLElement | null;
											prev?.focus();
											return;
										}
										if (e.key === "Escape") {
											e.preventDefault();
											(e.currentTarget as HTMLElement).blur();
										}
									}}
									role={canActivate ? "button" : undefined}
									style={shareBarStyle}
									tabIndex={canActivate ? 0 : -1}
								>
									{row.getVisibleCells().map((cell, cellIndex) => {
										const cellSize = cell.column.getSize();
										const isCompactColumn =
											getCompactColumnWidth(cell.column.id) !== undefined;
										const cellStyle = getColumnStyle(cell.column.id, cellSize);

										return (
											<TableCell
												className={cn(
													"h-9 px-3 py-1.5 text-foreground text-sm leading-5 transition-colors first:pl-3 last:pr-3",
													cellIndex === 0 && "font-medium",
													isCompactColumn && "px-3 text-right tabular-nums",
													(cell.column.columnDef.meta as any)?.className
												)}
												key={cell.id}
												style={cellStyle}
											>
												<div
													className={cn(
														"flex items-center gap-2",
														isCompactColumn && "justify-end",
														cellIndex === 0 &&
															"min-w-0 [&_img]:size-4 [&_svg]:size-4"
													)}
												>
													{cellIndex === 0 && hasSubRows && (
														<Button
															aria-label={
																isExpanded ? "Collapse row" : "Expand row"
															}
															className={cn(
																"size-7 shrink-0 rounded-md text-muted-foreground",
																isExpanded && "bg-primary/10 text-primary"
															)}
															onClick={(e) => {
																e.stopPropagation();
																toggleRowExpansion(row.id);
															}}
															size="icon-sm"
															type="button"
															variant="ghost"
														>
															{isExpanded ? (
																<CaretDownIcon
																	className="size-3.5"
																	weight="bold"
																/>
															) : (
																<CaretRightIcon
																	className="size-3.5"
																	weight="bold"
																/>
															)}
														</Button>
													)}
													<div className="min-w-0 flex-1 truncate">
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext()
														)}
													</div>
												</div>
											</TableCell>
										);
									})}
								</TableRow>

								{hasSubRows &&
									isExpanded &&
									subRows.map((subRow, subIndex) => (
										<TableRow
											className="border-border/70 border-b bg-muted/30 last:border-b-0 hover:bg-muted/40"
											key={`${row.id}-sub-${subIndex}`}
										>
											{renderSubRow ? (
												<TableCell
													className="p-0"
													colSpan={row.getVisibleCells().length}
												>
													{renderSubRow(subRow, row.original, subIndex)}
												</TableCell>
											) : (
												row.getVisibleCells().map((cell, cellIndex) => {
													const subCellSize = cell.column.getSize();
													const isCompactColumn =
														getCompactColumnWidth(cell.column.id) !== undefined;
													const subCellStyle = getColumnStyle(
														cell.column.id,
														subCellSize
													);

													return (
														<TableCell
															className={cn(
																"py-1.5 text-muted-foreground text-sm",
																cellIndex === 0 ? "pl-10" : "px-3",
																isCompactColumn &&
																	"px-3 text-right tabular-nums"
															)}
															key={`sub-${cell.id}`}
															style={subCellStyle}
														>
															<div className="truncate">
																{(subRow as any)[cell.column.id] || ""}
															</div>
														</TableCell>
													);
												})
											)}
										</TableRow>
									))}
							</Fragment>
						);
					})}
				</TableBody>
			</TableComponent>
		</div>
	);
}

export const TableContent = memo(TableContentInner) as typeof TableContentInner;
