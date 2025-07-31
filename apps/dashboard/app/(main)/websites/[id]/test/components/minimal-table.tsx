'use client';

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type PaginationState,
	type RowData,
	type SortingState,
	useReactTable,
} from '@tanstack/react-table';
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronRight as ChevronRightIcon,
	DatabaseIcon,
	Search,
} from 'lucide-react';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface TabConfig<TData> {
	id: string;
	label: string;
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
}

interface MinimalTableProps<TData extends RowData, TValue> {
	data?: TData[] | undefined;
	columns?: ColumnDef<TData, TValue>[];
	tabs?: TabConfig<TData>[];
	title: string;
	description?: string;
	isLoading?: boolean;
	initialPageSize?: number;
	emptyMessage?: string;
	className?: string;
	onRowClick?: (row: TData) => void;
	minHeight?: string | number;
	showSearch?: boolean;
	// Expandable rows functionality
	getSubRows?: (row: TData) => TData[] | undefined;
	renderSubRow?: (
		subRow: TData,
		parentRow: TData,
		index: number
	) => React.ReactNode;
	expandable?: boolean;
}

// Helper function to get percentage value from row data
function getRowPercentage(row: any): number {
	// Try to find percentage in common property names
	if (row.marketShare !== undefined) {
		return Number.parseFloat(row.marketShare) || 0;
	}
	if (row.percentage !== undefined) {
		return Number.parseFloat(row.percentage) || 0;
	}
	if (row.percent !== undefined) {
		return Number.parseFloat(row.percent) || 0;
	}
	if (row.share !== undefined) {
		return Number.parseFloat(row.share) || 0;
	}
	return 0;
}

// Enhanced helper function for gradient colors with prominent percentage bars
function getPercentageGradient(percentage: number): {
	background: string;
	hoverBackground: string;
	borderColor: string;
	accentColor: string;
	glowColor: string;
} {
	if (percentage >= 40) {
		return {
			background: `linear-gradient(90deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.25) ${percentage * 0.6}%, rgba(34, 197, 94, 0.2) ${percentage}%, rgba(34, 197, 94, 0.05) ${percentage + 3}%, transparent 100%)`,
			hoverBackground: `linear-gradient(90deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.35) ${percentage * 0.6}%, rgba(34, 197, 94, 0.3) ${percentage}%, rgba(34, 197, 94, 0.08) ${percentage + 3}%, transparent 100%)`,
			borderColor: 'rgba(34, 197, 94, 0.4)',
			accentColor: 'rgba(34, 197, 94, 0.8)',
			glowColor: 'rgba(34, 197, 94, 0.3)',
		};
	}
	if (percentage >= 25) {
		return {
			background: `linear-gradient(90deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.25) ${percentage * 0.6}%, rgba(59, 130, 246, 0.2) ${percentage}%, rgba(59, 130, 246, 0.05) ${percentage + 3}%, transparent 100%)`,
			hoverBackground: `linear-gradient(90deg, rgba(59, 130, 246, 0.2) 0%, rgba(59, 130, 246, 0.35) ${percentage * 0.6}%, rgba(59, 130, 246, 0.3) ${percentage}%, rgba(59, 130, 246, 0.08) ${percentage + 3}%, transparent 100%)`,
			borderColor: 'rgba(59, 130, 246, 0.4)',
			accentColor: 'rgba(59, 130, 246, 0.8)',
			glowColor: 'rgba(59, 130, 246, 0.3)',
		};
	}
	if (percentage >= 10) {
		return {
			background: `linear-gradient(90deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.25) ${percentage * 0.6}%, rgba(245, 158, 11, 0.2) ${percentage}%, rgba(245, 158, 11, 0.05) ${percentage + 3}%, transparent 100%)`,
			hoverBackground: `linear-gradient(90deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.35) ${percentage * 0.6}%, rgba(245, 158, 11, 0.3) ${percentage}%, rgba(245, 158, 11, 0.08) ${percentage + 3}%, transparent 100%)`,
			borderColor: 'rgba(245, 158, 11, 0.4)',
			accentColor: 'rgba(245, 158, 11, 0.8)',
			glowColor: 'rgba(245, 158, 11, 0.3)',
		};
	}
	return {
		background: `linear-gradient(90deg, rgba(107, 114, 128, 0.12) 0%, rgba(107, 114, 128, 0.2) ${percentage * 0.6}%, rgba(107, 114, 128, 0.15) ${percentage}%, rgba(107, 114, 128, 0.03) ${percentage + 3}%, transparent 100%)`,
		hoverBackground: `linear-gradient(90deg, rgba(107, 114, 128, 0.15) 0%, rgba(107, 114, 128, 0.28) ${percentage * 0.6}%, rgba(107, 114, 128, 0.22) ${percentage}%, rgba(107, 114, 128, 0.05) ${percentage + 3}%, transparent 100%)`,
		borderColor: 'rgba(107, 114, 128, 0.3)',
		accentColor: 'rgba(107, 114, 128, 0.7)',
		glowColor: 'rgba(107, 114, 128, 0.2)',
	};
}

// Enhanced skeleton loading component
const EnhancedSkeleton = ({ minHeight }: { minHeight: string | number }) => (
	<div className="animate-pulse space-y-3" style={{ minHeight }}>
		<div className="flex items-center justify-between">
			<Skeleton className="h-4 w-24 rounded-md" />
			<Skeleton className="h-8 w-32 rounded-lg" />
		</div>
		<div className="space-y-2">
			{Array.from({ length: 5 }, (_, index) => index).map((itemIndex) => (
				<div
					className="flex animate-pulse items-center space-x-4 rounded-lg bg-muted/20 p-3"
					key={`skeleton-${itemIndex}`}
				>
					<Skeleton className="h-6 w-6 flex-shrink-0 rounded-full" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-4 w-full rounded-md" />
						<div className="flex items-center space-x-2">
							<Skeleton className="h-3 w-16 rounded-sm" />
							<Skeleton className="h-3 w-12 rounded-sm" />
							<Skeleton className="h-3 w-8 rounded-sm" />
						</div>
					</div>
					<div className="space-y-1 text-right">
						<Skeleton className="h-4 w-12 rounded-md" />
						<Skeleton className="h-3 w-8 rounded-sm" />
					</div>
				</div>
			))}
		</div>
	</div>
);

export function MinimalTable<TData extends RowData, TValue>({
	data,
	columns,
	tabs,
	title,
	description,
	isLoading = false,
	initialPageSize,
	emptyMessage = 'No data available',
	className,
	onRowClick,
	minHeight = 200,
	showSearch = true,
	getSubRows,
	renderSubRow,
	expandable = false,
}: MinimalTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState('');
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: initialPageSize ?? 10,
	});
	const [activeTab, setActiveTab] = useState(tabs?.[0]?.id || '');
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

	// Use tab data if tabs are provided, otherwise use direct data/columns
	const currentTabData = tabs?.find((tab) => tab.id === activeTab);
	const tableData = useMemo(
		() => currentTabData?.data || data || [],
		[currentTabData?.data, data]
	);
	const tableColumns = useMemo(
		() => currentTabData?.columns || columns || [],
		[currentTabData?.columns, columns]
	);

	const table = useReactTable({
		data: tableData,
		columns: tableColumns,
		state: {
			sorting,
			globalFilter: showSearch ? globalFilter : '',
			pagination,
		},
		onSortingChange: setSorting,
		onGlobalFilterChange: setGlobalFilter,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});

	const displayData = table.getRowModel().rows;

	// Enhanced tab switching with transition
	const handleTabChange = useCallback(
		(tabId: string) => {
			if (tabId === activeTab) {
				return;
			}

			setIsTransitioning(true);
			setTimeout(() => {
				setActiveTab(tabId);
				// Reset pagination when switching tabs
				setPagination((prev) => ({ ...prev, pageIndex: 0 }));
				// Reset expanded rows when switching tabs
				setExpandedRows(new Set());
				setIsTransitioning(false);
			}, 150);
		},
		[activeTab]
	);

	// Toggle row expansion
	const toggleRowExpansion = useCallback((rowId: string) => {
		setExpandedRows((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(rowId)) {
				newSet.delete(rowId);
			} else {
				newSet.add(rowId);
			}
			return newSet;
		});
	}, []);

	if (isLoading) {
		return (
			<Card
				className={cn(
					'w-full overflow-hidden border-0 bg-card/50 shadow-sm backdrop-blur-sm',
					className
				)}
			>
				<CardHeader
					className={cn(
						'space-y-0 px-4 pb-3',
						showSearch ? 'flex flex-row items-center justify-between' : ''
					)}
				>
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Skeleton className="h-5 w-32 rounded-md" />
							<div className="h-2 w-2 animate-pulse rounded-full bg-primary/20" />
						</div>
						{description && <Skeleton className="h-3 w-48 rounded-sm" />}
					</div>
					{showSearch && <Skeleton className="h-8 w-32 rounded-lg" />}
				</CardHeader>

				{/* Tabs loading state */}
				{tabs && tabs.length > 1 && (
					<div className="px-3 pb-2">
						<div className="flex gap-1">
							{tabs.map((tab) => (
								<Skeleton className="h-7 w-16 rounded" key={tab.id} />
							))}
						</div>
					</div>
				)}

				<CardContent className="px-4 pb-3">
					<EnhancedSkeleton minHeight={minHeight} />
				</CardContent>
			</Card>
		);
	}

	return (
		<Card
			className={cn(
				'group w-full overflow-hidden border-0 bg-card/50 shadow-sm backdrop-blur-sm',
				className
			)}
		>
			<CardHeader className="px-3 pb-2">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<h3 className="truncate font-semibold text-foreground text-sm">
							{title}
						</h3>
						{description && (
							<p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
								{description}
							</p>
						)}
					</div>

					{showSearch && (
						<div className="relative flex-shrink-0">
							<Search className="-translate-y-1/2 absolute top-1/2 left-2 h-3 w-3 transform text-muted-foreground/50" />
							<Input
								aria-label={`Search ${title}`}
								className="h-7 w-36 border-0 bg-muted/30 pr-2 pl-7 text-xs focus:bg-background focus:ring-1 focus:ring-primary/20"
								onChange={(event) => setGlobalFilter(event.target.value)}
								placeholder="Filter data..."
								value={globalFilter ?? ''}
							/>
						</div>
					)}
				</div>
			</CardHeader>

			{/* Tabs */}
			{tabs && tabs.length > 1 && (
				<div className="px-3 pb-2">
					<nav
						aria-label="Data view options"
						className="flex gap-0.5 rounded-lg bg-muted/40 p-0.5"
					>
						{tabs.map((tab) => {
							const isActive = activeTab === tab.id;
							const itemCount = tab.data?.length || 0;

							return (
								<button
									aria-controls={`tabpanel-${tab.id}`}
									aria-selected={isActive}
									className={cn(
										'flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium text-xs transition-all duration-200',
										'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-1',
										'disabled:cursor-not-allowed disabled:opacity-60',
										isActive
											? 'bg-background text-foreground shadow-sm'
											: 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
									)}
									disabled={isTransitioning}
									key={tab.id}
									onClick={() => handleTabChange(tab.id)}
									role="tab"
									tabIndex={isActive ? 0 : -1}
									type="button"
								>
									<span>{tab.label}</span>
									{itemCount > 0 && (
										<span
											className={cn(
												'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-semibold text-[10px]',
												isActive
													? 'bg-primary/15 text-primary'
													: 'bg-muted-foreground/20 text-muted-foreground/70'
											)}
										>
											{itemCount > 99 ? '99+' : itemCount}
										</span>
									)}
								</button>
							);
						})}
					</nav>
				</div>
			)}

			<CardContent className="overflow-hidden px-3 pb-2">
				<div
					className={cn(
						'overflow-hidden transition-all duration-300',
						isTransitioning && 'scale-[0.98] transform opacity-50'
					)}
				>
					{table.getRowModel().rows.length ? (
						<div
							aria-labelledby={`tab-${activeTab}`}
							className="relative overflow-hidden rounded-lg border border-border/50 bg-background/50"
							id={`tabpanel-${activeTab}`}
							role="tabpanel"
							style={{ minHeight }}
						>
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										{table.getHeaderGroups().map((headerGroup) => (
											<TableRow
												className="sticky top-0 z-10 border-border/30 bg-muted/20"
												key={headerGroup.id}
											>
												{headerGroup.headers.map((header) => (
													<TableHead
														aria-sort={
															header.column.getIsSorted() === 'asc'
																? 'ascending'
																: header.column.getIsSorted() === 'desc'
																	? 'descending'
																	: header.column.getCanSort()
																		? 'none'
																		: undefined
														}
														className={cn(
															'h-9 bg-muted/20 px-3 font-semibold text-muted-foreground text-xs backdrop-blur-sm',
															(header.column.columnDef.meta as any)?.className,
															header.column.getCanSort()
																? 'group cursor-pointer select-none transition-all duration-200 hover:bg-muted/30 hover:text-foreground'
																: 'select-none'
														)}
														key={header.id}
														onClick={header.column.getToggleSortingHandler()}
														role={
															header.column.getCanSort() ? 'button' : undefined
														}
														style={{
															width:
																header.getSize() !== 150
																	? header.getSize()
																	: undefined,
														}}
														tabIndex={header.column.getCanSort() ? 0 : -1}
													>
														<div className="flex items-center gap-1.5">
															<span className="truncate">
																{header.isPlaceholder
																	? null
																	: flexRender(
																			header.column.columnDef.header,
																			header.getContext()
																		)}
															</span>
															{header.column.getCanSort() && (
																<div className="flex h-3 w-3 flex-col items-center justify-center">
																	{!header.column.getIsSorted() && (
																		<ArrowUpDown className="h-3 w-3 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground/70" />
																	)}
																	{header.column.getIsSorted() === 'asc' && (
																		<ArrowUp className="h-3 w-3 text-primary" />
																	)}
																	{header.column.getIsSorted() === 'desc' && (
																		<ArrowDown className="h-3 w-3 text-primary" />
																	)}
																</div>
															)}
														</div>
													</TableHead>
												))}
											</TableRow>
										))}
									</TableHeader>
									<TableBody className="overflow-hidden">
										{displayData.map((row, index) => {
											const subRows =
												expandable && getSubRows
													? getSubRows(row.original)
													: undefined;
											const hasSubRows = subRows && subRows.length > 0;
											const isExpanded = expandedRows.has(row.id);
											const percentage = getRowPercentage(row.original);
											const gradient = getPercentageGradient(percentage);

											return (
												<Fragment key={row.id}>
													<TableRow
														aria-expanded={hasSubRows ? isExpanded : undefined}
														aria-label={
															hasSubRows
																? `${isExpanded ? 'Collapse' : 'Expand'} details for row ${index + 1}`
																: onRowClick
																	? `View details for row ${index + 1}`
																	: undefined
														}
														className={cn(
															'group relative h-11 border-border/20 transition-all duration-200',
															'focus-within:bg-muted/20 hover:bg-muted/20',
															onRowClick &&
																!hasSubRows &&
																'cursor-pointer focus-within:bg-muted/30 hover:bg-muted/30 active:bg-muted/40',
															index % 2 === 0
																? 'bg-background/50'
																: 'bg-muted/10'
														)}
														onClick={() => {
															if (hasSubRows) {
																toggleRowExpansion(row.id);
															} else {
																onRowClick?.(row.original);
															}
														}}
														onKeyDown={(e) => {
															if (
																(onRowClick || hasSubRows) &&
																(e.key === 'Enter' || e.key === ' ')
															) {
																e.preventDefault();
																if (hasSubRows) {
																	toggleRowExpansion(row.id);
																} else {
																	onRowClick?.(row.original);
																}
															}
														}}
														onMouseEnter={(e) => {
															if (percentage > 0) {
																const target = e.currentTarget as HTMLElement;
																target.style.background =
																	gradient.hoverBackground;
															}
														}}
														onMouseLeave={(e) => {
															if (percentage > 0) {
																const target = e.currentTarget as HTMLElement;
																target.style.background = gradient.background;
															}
														}}
														role={
															onRowClick || hasSubRows ? 'button' : undefined
														}
														style={{
															background:
																percentage > 0
																	? gradient.background
																	: undefined,
															borderLeft:
																percentage > 0
																	? '2px solid transparent'
																	: undefined,
															boxShadow:
																percentage > 0
																	? `inset 3px 0 0 ${gradient.borderColor}`
																	: undefined,
															animationDelay: `${index * 30}ms`,
															animationFillMode: 'both',
														}}
														tabIndex={onRowClick || hasSubRows ? 0 : -1}
													>
														{row.getVisibleCells().map((cell, cellIndex) => (
															<TableCell
																className={cn(
																	'px-3 py-2.5 font-medium text-foreground/90 text-sm',
																	cellIndex === 0 &&
																		'font-semibold text-foreground',
																	(cell.column.columnDef.meta as any)?.className
																)}
																key={cell.id}
																style={{
																	width:
																		cell.column.getSize() !== 150
																			? cell.column.getSize()
																			: undefined,
																}}
															>
																<div className="flex items-center gap-2">
																	{/* Expansion toggle - only on first cell and if row has sub-rows */}
																	{cellIndex === 0 && hasSubRows && (
																		<button
																			aria-label={
																				isExpanded
																					? 'Collapse row'
																					: 'Expand row'
																			}
																			className="flex-shrink-0 rounded p-0.5 transition-colors hover:bg-muted"
																			onClick={(e) => {
																				e.stopPropagation();
																				toggleRowExpansion(row.id);
																			}}
																			type="button"
																		>
																			{isExpanded ? (
																				<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
																			) : (
																				<ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
																			)}
																		</button>
																	)}
																	<div className="flex-1 truncate">
																		{flexRender(
																			cell.column.columnDef.cell,
																			cell.getContext()
																		)}
																	</div>
																</div>
															</TableCell>
														))}
													</TableRow>

													{/* Sub-rows */}
													{hasSubRows &&
														isExpanded &&
														subRows.map((subRow, subIndex) => (
															<TableRow
																className="border-border/10 bg-muted/5 p-0 transition-colors hover:bg-muted/10"
																key={`${row.id}-sub-${subIndex}`}
															>
																{renderSubRow ? (
																	<TableCell
																		className="p-0"
																		colSpan={row.getVisibleCells().length}
																	>
																		{renderSubRow(
																			subRow,
																			row.original,
																			subIndex
																		)}
																	</TableCell>
																) : (
																	// Default sub-row rendering - show the same data but indented
																	row
																		.getVisibleCells()
																		.map((cell, cellIndex) => (
																			<TableCell
																				className={cn(
																					'py-2 text-muted-foreground text-sm',
																					cellIndex === 0 ? 'pl-8' : 'px-3'
																				)}
																				key={`sub-${cell.id}`}
																				style={{
																					width:
																						cell.column.getSize() !== 150
																							? cell.column.getSize()
																							: undefined,
																				}}
																			>
																				<div className="truncate">
																					{cellIndex === 0 ? (
																						<span className="text-xs">
																							↳{' '}
																							{(subRow as any)[
																								cell.column.id
																							] || ''}
																						</span>
																					) : (
																						(subRow as any)[cell.column.id] ||
																						''
																					)}
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
								</Table>
							</div>
						</div>
					) : (
						<div
							className="flex flex-col items-center justify-center py-12 text-center"
							style={{ minHeight }}
						>
							<div className="mb-3">
								<div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
									<DatabaseIcon className="h-5 w-5 text-muted-foreground/50" />
								</div>
							</div>
							<h4 className="mb-1 font-medium text-foreground text-sm">
								{globalFilter ? 'No results found' : emptyMessage}
							</h4>
							<p className="max-w-[200px] text-muted-foreground text-xs">
								{globalFilter
									? 'Try adjusting your search terms or clearing filters'
									: 'Data will appear here when available'}
							</p>
							{globalFilter && (
								<button
									className="mt-3 text-primary text-xs underline underline-offset-2 hover:text-primary/80"
									onClick={() => setGlobalFilter('')}
									type="button"
								>
									Clear search
								</button>
							)}
						</div>
					)}
				</div>

				{/* Pagination */}
				{(table.getFilteredRowModel().rows.length >
					table.getState().pagination.pageSize ||
					table.getPageCount() > 1) && (
					<div className="flex items-center justify-between border-border/30 border-t pt-3">
						<div className="flex items-center gap-2 text-muted-foreground text-xs">
							{(() => {
								const pageIndex = table.getState().pagination.pageIndex;
								const pageSize = table.getState().pagination.pageSize;
								const filteredRowCount =
									table.getFilteredRowModel().rows.length;
								const totalRowCount = (data || []).length;
								const firstVisibleRow = pageIndex * pageSize + 1;
								const lastVisibleRow = Math.min(
									firstVisibleRow + pageSize - 1,
									filteredRowCount
								);

								return (
									<>
										<span className="font-medium">
											{firstVisibleRow}-{lastVisibleRow} of {filteredRowCount}
										</span>
										{filteredRowCount !== totalRowCount && (
											<span className="text-muted-foreground/60">
												(filtered from {totalRowCount})
											</span>
										)}
									</>
								);
							})()}
						</div>

						{table.getPageCount() > 1 && (
							<div className="flex items-center gap-1">
								<Button
									aria-label="Previous page"
									className="h-7 w-7 p-0 hover:bg-muted/50"
									disabled={!table.getCanPreviousPage()}
									onClick={() => table.previousPage()}
									size="sm"
									variant="ghost"
								>
									<ChevronLeft className="h-3.5 w-3.5" />
								</Button>

								<div className="flex items-center gap-1 rounded-md bg-muted/20 px-2 py-1">
									<span className="min-w-0 font-medium text-xs">
										{table.getState().pagination.pageIndex + 1}
									</span>
									<span className="text-muted-foreground/70 text-xs">/</span>
									<span className="text-muted-foreground text-xs">
										{table.getPageCount()}
									</span>
								</div>

								<Button
									aria-label="Next page"
									className="h-7 w-7 p-0 hover:bg-muted/50"
									disabled={!table.getCanNextPage()}
									onClick={() => table.nextPage()}
									size="sm"
									variant="ghost"
								>
									<ChevronRight className="h-3.5 w-3.5" />
								</Button>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
