import {
	ArrowDownIcon,
	ArrowUpIcon,
	DatabaseIcon,
} from "@phosphor-icons/react";
import { flexRender, type Table } from "@tanstack/react-table";
import { Fragment, useCallback, useState } from "react";
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

const PERCENTAGE_THRESHOLDS = {
	HIGH: 50,
	MEDIUM: 25,
	LOW: 10,
} as const;

type PercentageRow = {
	percentage?: string | number;
};

function getRowPercentage(row: PercentageRow): number {
	const value = row.percentage;
	return value !== undefined ? Number.parseFloat(String(value)) || 0 : 0;
}

const GRADIENT_COLORS = {
	high: {
		rgb: "34, 197, 94",
		opacity: {
			background: 0.08,
			hover: 0.12,
			border: 0.3,
			accent: 0.8,
			glow: 0.2,
		},
	},
	medium: {
		rgb: "59, 130, 246",
		opacity: {
			background: 0.08,
			hover: 0.12,
			border: 0.3,
			accent: 0.8,
			glow: 0.2,
		},
	},
	low: {
		rgb: "245, 158, 11",
		opacity: {
			background: 0.08,
			hover: 0.12,
			border: 0.3,
			accent: 0.8,
			glow: 0.2,
		},
	},
	default: {
		rgb: "107, 114, 128",
		opacity: {
			background: 0.08,
			hover: 0.12,
			border: 0.2,
			accent: 0.7,
			glow: 0.15,
		},
	},
} as const;

function createGradient(
	rgb: string,
	opacity: {
		background: number;
		hover: number;
		border: number;
		accent: number;
		glow: number;
	},
	percentage: number
) {
	const {
		background: bgOpacity,
		hover: hoverOpacity,
		border: borderOpacity,
		accent: accentOpacity,
		glow: glowOpacity,
	} = opacity;

	return {
		background: `linear-gradient(90deg, rgba(${rgb}, ${bgOpacity}) 0%, rgba(${rgb}, ${bgOpacity + 0.07}) ${percentage * 0.8}%, rgba(${rgb}, ${bgOpacity + 0.04}) ${percentage}%, rgba(${rgb}, ${bgOpacity - 0.06}) ${percentage + 5}%, transparent 100%)`,
		hoverBackground: `linear-gradient(90deg, rgba(${rgb}, ${hoverOpacity}) 0%, rgba(${rgb}, ${hoverOpacity + 0.1}) ${percentage * 0.8}%, rgba(${rgb}, ${hoverOpacity + 0.06}) ${percentage}%, rgba(${rgb}, ${hoverOpacity - 0.08}) ${percentage + 5}%, transparent 100%)`,
		borderColor: `rgba(${rgb}, ${borderOpacity})`,
		accentColor: `rgba(${rgb}, ${accentOpacity})`,
		glowColor: `rgba(${rgb}, ${glowOpacity})`,
	};
}

function getPercentageGradient(percentage: number) {
	if (percentage >= PERCENTAGE_THRESHOLDS.HIGH) {
		return createGradient(
			GRADIENT_COLORS.high.rgb,
			GRADIENT_COLORS.high.opacity,
			percentage
		);
	}
	if (percentage >= PERCENTAGE_THRESHOLDS.MEDIUM) {
		return createGradient(
			GRADIENT_COLORS.medium.rgb,
			GRADIENT_COLORS.medium.opacity,
			percentage
		);
	}
	if (percentage >= PERCENTAGE_THRESHOLDS.LOW) {
		return createGradient(
			GRADIENT_COLORS.low.rgb,
			GRADIENT_COLORS.low.opacity,
			percentage
		);
	}
	return createGradient(
		GRADIENT_COLORS.default.rgb,
		GRADIENT_COLORS.default.opacity,
		percentage
	);
}

type TableContentProps<TData extends { name: string | number }> = {
	table: Table<TData>;
	title?: string;
	minHeight?: string | number;
	expandable?: boolean;
	getSubRows?: (row: TData) => TData[] | undefined;
	renderSubRow?: (
		subRow: TData,
		parentRow: TData,
		index: number
	) => React.ReactNode;
	onAddFilter?: (field: string, value: string, tableTitle?: string) => void;
	onRowAction?: (row: TData) => void;
	onRowClick?: (field: string, value: string | number) => void;
	tabs?: any[];
	activeTab?: string;
	emptyMessage?: string;
	className?: string;
};

export function TableContent<TData extends { name: string | number }>({
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
			<TableEmptyState
				description="Data will appear here when available and ready to display."
				icon={<DatabaseIcon className="size-6 text-accent" />}
				title={emptyMessage}
			/>
		);
	}

	return (
		<div
			aria-labelledby={`tab-${activeTab}`}
			className={cn(
				"table-scrollbar relative overflow-auto bg-accent",
				className
			)}
			id={`tabpanel-${activeTab}`}
			role="tabpanel"
			style={{ height: minHeight }}
		>
			<TableComponent className="w-full table-fixed" key={`table-${activeTab}`}>
				<TableHeader>
					{headerGroups.map((headerGroup) => (
						<TableRow
							className="sticky top-0 z-10 bg-accent shadow-[0_0_0_0.5px_var(--border)]"
							key={headerGroup.id}
						>
							{headerGroup.headers.map((header) => (
								<TableHead
									className={cn(
										"h-10 bg-card px-2 font-semibold text-sidebar-foreground/70 text-xs uppercase tracking-wide",
										(header.column.columnDef.meta as any)?.className
									)}
									key={header.id}
									style={{
										width:
											header.getSize() !== 150
												? `${Math.min(header.getSize(), 300)}px`
												: undefined,
										maxWidth: "300px",
										minWidth: "80px",
									}}
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
				<TableBody className="overflow-hidden">
					{displayData.map((row, rowIndex) => {
						const subRows =
							expandable && getSubRows ? getSubRows(row.original) : undefined;
						const hasSubRows = !!subRows?.length;
						const percentage = getRowPercentage(row.original as PercentageRow);
						const gradient =
							percentage > 0 ? getPercentageGradient(percentage) : null;

						return (
							<Fragment key={row.id}>
								<TableRow
									className={cn(
										"relative h-11 border border-border border-r-0 bg-accent-brighter/30! pl-3 transition-all duration-300 ease-in-out",
										(isInteractive || hasSubRows) && "cursor-pointer",
										!gradient &&
											(rowIndex % 2 === 0 ? "bg-accent/50" : "bg-accent/10")
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
									role={isInteractive || hasSubRows ? "button" : undefined}
									style={{
										background: gradient?.background,
										boxShadow: gradient
											? `inset 3px 0 0 0 ${gradient.accentColor}`
											: undefined,
									}}
									tabIndex={isInteractive || hasSubRows ? 0 : -1}
								>
									{row.getVisibleCells().map((cell, cellIndex) => (
										<TableCell
											className={cn(
												"px-2 py-2 font-medium text-accent-foreground/80 text-sm",
												cellIndex === 0 &&
													"font-semibold text-sidebar-foreground",
												(cell.column.columnDef.meta as any)?.className
											)}
											key={cell.id}
											style={{
												width:
													cell.column.getSize() !== 150
														? `${Math.min(cell.column.getSize(), 300)}px`
														: undefined,
												maxWidth: "300px",
												minWidth: "80px",
											}}
										>
											<div className="flex items-center gap-2">
												{cellIndex === 0 && hasSubRows && (
													<button
														aria-label={
															expandedRow === row.id
																? "Collapse row"
																: "Expand row"
														}
														className="shrink-0 rounded p-0.5 hover:bg-sidebar-accent/60"
														onClick={(e) => {
															e.stopPropagation();
															toggleRowExpansion(row.id);
														}}
														type="button"
													>
														{expandedRow === row.id ? (
															<ArrowDownIcon className="h-3.5 w-3.5 text-sidebar-foreground/70" />
														) : (
															<ArrowUpIcon className="h-3.5 w-3.5 text-sidebar-foreground/70" />
														)}
													</button>
												)}
												<div className="flex-1 overflow-hidden truncate">
													<div className="truncate">
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext()
														)}
													</div>
												</div>
											</div>
										</TableCell>
									))}
								</TableRow>

								{hasSubRows &&
									expandedRow === row.id &&
									subRows.map((subRow, subIndex) => (
										<TableRow
											className="border-border/50 bg-accent hover:bg-accent/10"
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
												row.getVisibleCells().map((cell, cellIndex) => (
													<TableCell
														className={cn(
															"py-2 text-sidebar-foreground/70 text-sm",
															cellIndex === 0 ? "pl-8" : "px-2"
														)}
														key={`sub-${cell.id}`}
														style={{
															width:
																cell.column.getSize() !== 150
																	? `${Math.min(cell.column.getSize(), 300)}px`
																	: undefined,
															maxWidth: "300px",
															minWidth: "80px",
														}}
													>
														<div className="truncate">
															{cellIndex === 0 && (
																<span className="text-xs">↳ </span>
															)}
															{(subRow as any)[cell.column.id] || ""}
														</div>
													</TableCell>
												))
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
