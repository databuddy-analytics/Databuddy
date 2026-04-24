import {
	CaretDownIcon,
	CaretRightIcon,
	DatabaseIcon,
} from "@phosphor-icons/react";
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
	maxWidth: "300px",
	minWidth: "80px",
} as const;

const cellStyleCache = new Map<number, React.CSSProperties>();

function getCellStyle(size: number): React.CSSProperties {
	if (size === 150) {
		return DEFAULT_CELL_STYLE;
	}

	const cached = cellStyleCache.get(size);
	if (cached) {
		return cached;
	}

	const style = {
		width: `${Math.min(size, 300)}px`,
		maxWidth: "300px",
		minWidth: "80px",
	} as const;

	cellStyleCache.set(size, style);
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
	const solidEnd = Math.max(0, percentage - 4);
	return {
		backgroundImage: `linear-gradient(to right, color-mix(in oklab, var(--primary) 8%, transparent) 0%, color-mix(in oklab, var(--primary) 8%, transparent) ${solidEnd}%, transparent ${percentage}%)`,
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
							{headerGroup.headers.map((header) => (
								<TableHead
									className={cn(
										"h-10 px-5 font-medium text-muted-foreground text-xs",
										(header.column.columnDef.meta as any)?.className
									)}
									key={header.id}
									style={{
										width:
											header.getSize() === 150
												? undefined
												: `${Math.min(header.getSize(), 300)}px`,
										maxWidth: "300px",
										minWidth: "80px",
									}}
									title={resolveShareColumnTitle(
										header.column.id,
										shareColumnTooltip
									)}
								>
									<span className="truncate">
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext()
												)}
									</span>
								</TableHead>
							))}
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
										"border-border/80 border-b transition-colors last:border-b-0 hover:bg-accent/50",
										canActivate &&
											"cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
									)}
									onClick={() =>
										handleRowClick(row.original, hasSubRows, row.id)
									}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											e.currentTarget.click();
										}
									}}
									role={canActivate ? "button" : undefined}
									style={shareBarStyle}
									tabIndex={canActivate ? 0 : -1}
								>
									{row.getVisibleCells().map((cell, cellIndex) => {
										const cellSize = cell.column.getSize();
										const cellStyle = getCellStyle(cellSize);

										return (
											<TableCell
												className={cn(
													"px-5 py-3 text-foreground text-sm",
													cellIndex === 0 && "font-medium",
													(cell.column.columnDef.meta as any)?.className
												)}
												key={cell.id}
												style={cellStyle}
											>
												<div className="flex items-center gap-2">
													{cellIndex === 0 && hasSubRows && (
														<button
															aria-label={
																isExpanded ? "Collapse row" : "Expand row"
															}
															className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
															onClick={(e) => {
																e.stopPropagation();
																toggleRowExpansion(row.id);
															}}
															type="button"
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
														</button>
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
											className="border-border/80 border-b bg-muted/40 last:border-b-0"
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
													const subCellStyle = getCellStyle(subCellSize);

													return (
														<TableCell
															className={cn(
																"py-2 text-muted-foreground text-sm",
																cellIndex === 0 ? "pl-12" : "px-5"
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
