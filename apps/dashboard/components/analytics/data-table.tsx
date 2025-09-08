import {
	ArrowDownIcon,
	ArrowsDownUpIcon,
	ArrowsOutSimpleIcon,
	ArrowUpIcon,
	DatabaseIcon,
	MagnifyingGlassIcon,
	XIcon,
} from '@phosphor-icons/react';
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import React, {
	Fragment,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import ReactDOM from 'react-dom';
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

// Constants to reduce magic numbers and improve maintainability
const DEFAULT_MIN_HEIGHT = 200;
const FULLSCREEN_HEIGHT = '92vh';
const FULLSCREEN_WIDTH = '92vw';
const DEFAULT_PAGE_SIZE = 50;
const TAB_TRANSITION_DELAY = 150;

// Row percentage thresholds for gradient colors
const PERCENTAGE_THRESHOLDS = {
	HIGH: 50,
	MEDIUM: 25,
	LOW: 10,
} as const;

// Default column sizes
const _COLUMN_SIZES = {
	DEFAULT: 150,
	MIN_WIDTH: 80,
	MAX_WIDTH: 300,
} as const;

interface TabConfig<TData> {
	id: string;
	label: string;
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
	getFilter?: (row: TData) => { field: string; value: string };
}

interface DataTableProps<TData extends { name: string | number }, TValue> {
	data?: TData[] | undefined;
	columns?: ColumnDef<TData, TValue>[];
	tabs?: TabConfig<TData>[];
	title: string;
	description?: string;
	isLoading?: boolean;
	tabLoadingStates?: Record<string, boolean> | undefined;
	initialPageSize?: number;
	emptyMessage?: string;
	className?: string;
	onRowClick?: (field: string, value: string | number) => void;
	onAddFilter?: (field: string, value: string, tableTitle?: string) => void;
	onRowAction?: (row: TData) => void;
	minHeight?: string | number;
	showSearch?: boolean;
	getSubRows?: (row: TData) => TData[] | undefined;
	renderSubRow?: (
		subRow: TData,
		parentRow: TData,
		index: number
	) => React.ReactNode;
	expandable?: boolean;
	renderTooltipContent?: (row: TData) => React.ReactNode;
}

interface PercentageRow {
	marketShare?: string | number;
	percentage?: string | number;
	percentage_of_sessions?: string | number;
	percent?: string | number;
	share?: string | number;
}

function getRowPercentage(row: PercentageRow): number {
	const percentageFields: (keyof PercentageRow)[] = [
		'marketShare',
		'percentage',
		'percentage_of_sessions',
		'percent',
		'share',
	];

	for (const field of percentageFields) {
		if (row[field] !== undefined) {
			return Number.parseFloat(String(row[field])) || 0;
		}
	}
	return 0;
}

// Color schemes for different percentage ranges
const GRADIENT_COLORS = {
	high: {
		rgb: '34, 197, 94',
		opacity: {
			background: 0.08,
			hover: 0.12,
			border: 0.3,
			accent: 0.8,
			glow: 0.2,
		},
	},
	medium: {
		rgb: '59, 130, 246',
		opacity: {
			background: 0.08,
			hover: 0.12,
			border: 0.3,
			accent: 0.8,
			glow: 0.2,
		},
	},
	low: {
		rgb: '245, 158, 11',
		opacity: {
			background: 0.08,
			hover: 0.12,
			border: 0.3,
			accent: 0.8,
			glow: 0.2,
		},
	},
	default: {
		rgb: '107, 114, 128',
		opacity: {
			background: 0.06,
			hover: 0.1,
			border: 0.2,
			accent: 0.7,
			glow: 0.15,
		},
	},
} as const;

function createGradient(
	rgb: string,
	opacity: typeof GRADIENT_COLORS.high.opacity,
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

function getPercentageGradient(percentage: number): {
	background: string;
	hoverBackground: string;
	borderColor: string;
	accentColor: string;
	glowColor: string;
} {
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

// Simple tab button component
interface TabButtonProps<TData> {
	tab: TabConfig<TData>;
	isActive: boolean;
	itemCount: number;
	onTabChange: (tabId: string) => void;
}

const TabButton = ({
	tab,
	isActive,
	itemCount,
	onTabChange,
}: TabButtonProps) => (
	<button
		aria-controls={`tabpanel-${tab.id}`}
		aria-selected={isActive}
		className={cn(
			'cursor-pointer border-b-2 px-3 py-2 text-sm transition-all duration-100 hover:text-foreground',
			isActive
				? 'border-foreground text-foreground'
				: 'border-transparent text-muted-foreground'
		)}
		onClick={() => onTabChange(tab.id)}
		role="tab"
		type="button"
	>
		{tab.label}
		{itemCount > 0 && (
			<span className="ml-1 text-xs opacity-60">
				({itemCount > 999 ? '999+' : itemCount})
			</span>
		)}
	</button>
);

const EnhancedSkeleton = ({ minHeight }: { minHeight: string | number }) => (
	<div className="animate-pulse space-y-3" style={{ minHeight }}>
		<div className="flex items-center justify-between">
			<Skeleton className="h-4 w-24 rounded" />
			<Skeleton className="h-8 w-32 rounded" />
		</div>
		<div className="space-y-2">
			{Array.from({ length: 5 }, (_, index) => index).map((itemIndex) => (
				<div
					className="flex animate-pulse items-center space-x-4 rounded bg-sidebar-accent/20 p-3"
					key={`skeleton-${itemIndex}`}
				>
					<Skeleton className="h-6 w-6 flex-shrink-0 rounded-full" />
					<div className="flex-1 space-y-2">
						<Skeleton className="h-4 w-full rounded" />
						<div className="flex items-center space-x-2">
							<Skeleton className="h-3 w-16 rounded" />
							<Skeleton className="h-3 w-12 rounded" />
							<Skeleton className="h-3 w-8 rounded" />
						</div>
					</div>
					<div className="space-y-1 text-right">
						<Skeleton className="h-4 w-12 rounded" />
						<Skeleton className="h-3 w-8 rounded" />
					</div>
				</div>
			))}
		</div>
	</div>
);

function FullScreenTable<TData extends { name: string | number }>({
	data,
	columns,
	search,
	onClose,
	initialPageSize = DEFAULT_PAGE_SIZE,
	expandable = false,
	getSubRows,
	renderSubRow,
	tabs,
	activeTab,
	onTabChange,
	title,
	description,
	isTransitioning = false,
	showSearch = true,
	onAddFilter,
}: {
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
	search: string;
	onClose: () => void;
	initialPageSize?: number;
	expandable?: boolean;
	getSubRows?: (row: TData) => TData[] | undefined;
	renderSubRow?: (
		subRow: TData,
		parentRow: TData,
		index: number
	) => React.ReactNode;
	tabs?: TabConfig<TData>[];
	activeTab?: string;
	onTabChange?: (tabId: string) => void;
	title?: string;
	description?: string;
	isTransitioning?: boolean;
	showSearch?: boolean;
	onAddFilter?: (field: string, value: string, tableTitle?: string) => void;
}) {
	const [globalFilter, setGlobalFilter] = useState(search);
	const [sorting, setSorting] = useState<SortingState>([]);
	const [expandedRow, setExpandedRow] = useState<string | null>(null);
	const [tabFocusIndex, setTabFocusIndex] = useState<number>(-1);
	const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const table = useReactTable({
		data,
		columns,
		state: { sorting, globalFilter },
		onSortingChange: setSorting,
		onGlobalFilterChange: setGlobalFilter,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});
	// Tooltip for truncated cell
	const toggleRowExpansion = (rowId: string) => {
		setExpandedRow((prev) => (prev === rowId ? null : rowId));
	};

	// Keyboard navigation for tabs
	useEffect(() => {
		if (!tabs || tabs.length < 2) {
			return;
		}
		if (tabFocusIndex >= 0 && tabRefs.current[tabFocusIndex]) {
			tabRefs.current[tabFocusIndex]?.focus();
		}
	}, [tabFocusIndex, tabs]);

	const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
		if (!tabs) {
			return;
		}
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			setTabFocusIndex((idx + 1) % tabs.length);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			setTabFocusIndex((idx - 1 + tabs.length) % tabs.length);
		} else if (e.key === 'Home') {
			e.preventDefault();
			setTabFocusIndex(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			setTabFocusIndex(tabs.length - 1);
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (onTabChange) {
				onTabChange(tabs[idx].id);
			}
		}
	};

	return (
		<div className="relative flex h-full w-full flex-col bg-sidebar">
			{/* CardHeader style header */}
			<div className="flex items-start justify-between border-sidebar-border border-b bg-sidebar px-3 pt-3 pb-2">
				<div className="min-w-0 flex-1">
					{title && (
						<h3 className="truncate font-semibold text-sidebar-foreground text-sm">
							{title}
						</h3>
					)}
					{description && (
						<p className="mt-0.5 line-clamp-2 text-sidebar-foreground/70 text-xs">
							{description}
						</p>
					)}
				</div>
				<button
					aria-label="Close full screen"
					className="ml-2 flex items-center justify-center rounded bg-sidebar-accent/60 p-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
					onClick={onClose}
					style={{ minWidth: 40, minHeight: 40 }}
					tabIndex={0}
					title="Close"
					type="button"
				>
					<XIcon size={20} />
				</button>
			</div>
			{/* Tab bar */}
			{tabs && tabs.length > 1 && (
				<div className="mt-2 px-3">
					<div className="flex gap-1 border-b">
						{tabs.map((tab, idx) => {
							const isActive = activeTab === tab.id;
							const itemCount = tab?.data?.length || 0;

							return (
								<TabButton
									isActive={isActive}
									itemCount={itemCount}
									key={tab.id}
									onTabChange={(tabId) => {
										handleTabKeyDown(
											{ key: 'Enter' } as React.KeyboardEvent,
											idx
										);
										onTabChange?.(tabId);
									}}
									tab={tab}
								/>
							);
						})}
					</div>
				</div>
			)}
			{/* Search bar, consistent with main DataTable */}
			{showSearch && (
				<div className="flex items-center px-3 py-2">
					<div className="relative w-full max-w-xs">
						<Input
							aria-label="Search table"
							className="h-8 w-full border-sidebar-border bg-sidebar-accent/30 pr-2 pl-7 text-sidebar-foreground text-xs"
							onChange={(event) => setGlobalFilter(event.target.value)}
							placeholder="Filter data..."
							value={globalFilter ?? ''}
						/>
						<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-2 h-3 w-3 transform text-sidebar-foreground/50" />
						{globalFilter && (
							<button
								aria-label="Clear search"
								className="-translate-y-1/2 absolute top-1/2 right-2 rounded p-1 hover:bg-sidebar-accent/60"
								onClick={() => setGlobalFilter('')}
								type="button"
							>
								<XIcon className="h-3 w-3 text-sidebar-foreground/60" />
							</button>
						)}
					</div>
				</div>
			)}
			{/* Table content, consistent with main DataTable */}
			<div className="flex-1 overflow-auto px-3 pb-3">
				<Table className="w-full table-fixed">
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								className="sticky top-0 z-10 border-sidebar-border/30 bg-sidebar-accent/20"
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
											'h-11 bg-sidebar-accent/20 px-2 font-semibold text-sidebar-foreground/70 text-xs uppercase tracking-wide backdrop-blur-sm sm:px-4',
											(header.column.columnDef.meta as { className?: string })
												?.className,
											header.column.getCanSort()
												? 'group cursor-pointer select-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
												: 'select-none'
										)}
										key={header.id}
										onClick={header.column.getToggleSortingHandler()}
										role={header.column.getCanSort() ? 'button' : undefined}
										style={{
											width:
												header.getSize() !== 150
													? `${Math.min(header.getSize(), 300)}px`
													: undefined,
											maxWidth: '300px',
											minWidth: '80px',
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
														<ArrowsDownUpIcon className="h-3 w-3 text-sidebar-foreground/40 transition-colors group-hover:text-sidebar-foreground/70" />
													)}
													{header.column.getIsSorted() === 'asc' && (
														<ArrowUpIcon className="h-3 w-3 text-sidebar-ring" />
													)}
													{header.column.getIsSorted() === 'desc' && (
														<ArrowDownIcon className="h-3 w-3 text-sidebar-ring" />
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
						{table
							.getRowModel()
							.rows.slice(0, initialPageSize)
							.map((row, rowIndex) => {
								const subRows =
									expandable && getSubRows
										? getSubRows(row.original)
										: undefined;
								const hasSubRows = subRows && subRows.length > 0;
								const isExpanded = expandedRow === row.id;
								return (
									<Fragment key={row.id}>
										<TableRow
											className={cn(
												'relative h-12 border-border/20 transition-all duration-300 ease-in-out',
												hasSubRows ? 'cursor-pointer' : '',
												rowIndex % 2 === 0 ? 'bg-background/50' : 'bg-muted/10'
											)}
											onClick={() => {
												if (hasSubRows) {
													toggleRowExpansion(row.id);
												} else if (onAddFilter && row.original.name) {
													onAddFilter('name', String(row.original.name), title);
												}
											}}
										>
											{row.getVisibleCells().map((cell, cellIndex) => (
												<TableCell
													className={cn(
														'px-2 py-3 font-medium text-sm transition-colors duration-150 sm:px-4',
														cellIndex === 0 && 'font-semibold text-foreground',
														(
															cell.column.columnDef.meta as {
																className?: string;
															}
														)?.className
													)}
													key={cell.id}
													style={{
														width:
															cell.column.getSize() !== 150
																? `${Math.min(cell.column.getSize(), 300)}px`
																: undefined,
														maxWidth: '300px',
														minWidth: '80px',
													}}
												>
													<div className="flex items-center gap-2">
														{cellIndex === 0 && hasSubRows && (
															<button
																aria-label={
																	isExpanded ? 'Collapse row' : 'Expand row'
																}
																className="flex-shrink-0 rounded p-0.5 transition-colors hover:bg-muted"
																onClick={(e) => {
																	e.stopPropagation();
																	toggleRowExpansion(row.id);
																}}
																type="button"
															>
																{isExpanded ? (
																	<ArrowDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
																) : (
																	<ArrowUpIcon className="h-3.5 w-3.5 text-muted-foreground" />
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
											isExpanded &&
											subRows.map((subRow, subIndex) => (
												<TableRow
													className="border-border/10 bg-muted/5 transition-colors hover:bg-muted/10"
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
																	'py-2 text-muted-foreground text-sm',
																	cellIndex === 0 ? 'pl-8' : 'px-3'
																)}
																key={`sub-${cell.id}`}
																style={{
																	width:
																		cell.column.getSize() !== 150
																			? `${Math.min(cell.column.getSize(), 300)}px`
																			: undefined,
																	maxWidth: '300px',
																	minWidth: '80px',
																}}
															>
																<div className="truncate">
																	{cellIndex === 0 ? (
																		<span className="text-xs">
																			↳ {(subRow as any)[cell.column.id] || ''}
																		</span>
																	) : (
																		(subRow as any)[cell.column.id] || ''
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
	);
}

export function DataTable<TData extends { name: string | number }, TValue>({
	data,
	columns,
	tabs,
	title,
	description,
	isLoading = false,
	tabLoadingStates,
	emptyMessage = 'No data available',
	className,
	onRowClick,
	minHeight = DEFAULT_MIN_HEIGHT,
	showSearch = true,
	getSubRows,
	renderSubRow,
	expandable = false,
	renderTooltipContent,
	onAddFilter,
	onRowAction,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [globalFilter, setGlobalFilter] = useState('');
	const [activeTab, setActiveTab] = useState(tabs?.[0]?.id || '');
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [expandedRow, setExpandedRow] = useState<string | null>(null);
	const [hoveredRow, setHoveredRow] = useState<string | null>(null);
	const [tooltipState, setTooltipState] = useState<{
		visible: boolean;
		content: React.ReactNode;
	}>({ visible: false, content: null });
	const [fullScreen, setFullScreen] = useState(false);
	const [hasMounted, setHasMounted] = useState(false);
	const lastFocusedElement = useRef<HTMLElement | null>(null);
	const modalRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setHasMounted(true);
	}, []);

	// Focus trap and restore
	useEffect(() => {
		if (!fullScreen) {
			return;
		}
		lastFocusedElement.current = document.activeElement as HTMLElement;
		const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		);
		if (focusable?.length) {
			focusable[0].focus();
		}
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setFullScreen(false);
			}
			if (e.key === 'Tab' && focusable && focusable.length) {
				const first = focusable[0];
				const last = focusable.at(-1);
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			lastFocusedElement.current?.focus();
		};
	}, [fullScreen]);

	const tableContainerRef = useRef<HTMLDivElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);

	const currentTabData = tabs?.find((tab) => tab.id === activeTab);
	const tableData = React.useMemo(
		() => currentTabData?.data || data || [],
		[currentTabData?.data, data]
	);
	const tableColumns = React.useMemo(
		() =>
			(currentTabData?.columns || columns || []) as ColumnDef<TData, TValue>[],
		[currentTabData?.columns, columns]
	);

	const table = useReactTable({
		data: tableData,
		columns: tableColumns,
		getRowId: (row, index) => {
			if ((row as any)._uniqueKey) {
				return (row as any)._uniqueKey;
			}
			return activeTab ? `${activeTab}-${index}` : `row-${index}`;
		},
		state: {
			sorting,
			globalFilter: showSearch ? globalFilter : '',
		},
		onSortingChange: setSorting,
		onGlobalFilterChange: setGlobalFilter,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});

	const displayData = table.getRowModel().rows;
	const toggleRowExpansion = useCallback((rowId: string) => {
		setExpandedRow((prev) => (prev === rowId ? null : rowId));
	}, []);

	const handleMouseMove = useCallback((e: React.MouseEvent) => {
		if (tooltipRef.current && tableContainerRef.current) {
			const rect = tableContainerRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			requestAnimationFrame(() => {
				if (tooltipRef.current) {
					tooltipRef.current.style.transform = `translate(${x + 16}px, ${y}px) translateY(-50%)`;
				}
			});
		}
	}, []);

	const handleRowMouseEnter = useCallback(
		(row: TData, rowId: string) => {
			if (!renderTooltipContent) {
				return;
			}
			const content = renderTooltipContent(row);
			setTooltipState({ visible: true, content });
			setHoveredRow(rowId);
		},
		[renderTooltipContent]
	);

	const handleMouseLeave = useCallback(() => {
		if (!renderTooltipContent) {
			return;
		}
		setTooltipState({ visible: false, content: null });
		setHoveredRow(null);
	}, [renderTooltipContent]);

	const handleTabChange = React.useCallback(
		(tabId: string) => {
			if (tabId === activeTab) {
				return;
			}

			setIsTransitioning(true);
			setTimeout(() => {
				setActiveTab(tabId);
				setGlobalFilter('');
				setExpandedRow(null);
				setIsTransitioning(false);
			}, TAB_TRANSITION_DELAY);
		},
		[activeTab]
	);

	if (isLoading) {
		return (
			<div
				className={cn(
					'w-full overflow-hidden rounded border-sidebar-border bg-sidebar/50 shadow-sm backdrop-blur-sm',
					className
				)}
			>
				<div className="p-4 px-2 pb-2 sm:px-3">
					<div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
						<div className="min-w-0 flex-1">
							<Skeleton className="h-5 w-32 rounded" />
							{description && <Skeleton className="mt-0.5 h-3 w-48 rounded" />}
						</div>
						{showSearch && (
							<div className="flex-shrink-0">
								<Skeleton className="h-7 w-36 rounded" />
							</div>
						)}
					</div>

					{tabs && tabs.length > 1 && (
						<div className="mt-3">
							<div className="flex gap-1 border-b">
								{tabs.map((tab) => (
									<Skeleton className="h-8 w-20 rounded" key={tab.id} />
								))}
							</div>
						</div>
					)}
				</div>
				<div className="px-2 pb-2 sm:px-3">
					<EnhancedSkeleton minHeight={minHeight} />
				</div>
			</div>
		);
	}

	// Extracted table content for DRYness
	const renderTableContent = () => (
		<>
			<div className="px-3 pt-3 pb-2">
				<div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
					<div className="min-w-0 flex-1">
						<h3 className="truncate font-semibold text-sidebar-foreground text-sm">
							{title}
						</h3>
						{description && (
							<p className="mt-0.5 line-clamp-2 text-sidebar-foreground/70 text-xs">
								{description}
							</p>
						)}
					</div>
					<div className="flex items-center gap-2">
						{showSearch && (
							<div className="relative w-full flex-shrink-0 sm:w-auto">
								<MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-2 h-3 w-3 transform text-sidebar-foreground/50" />
								<Input
									aria-label={`Search ${title}`}
									className="h-8 w-full border-sidebar-border bg-sidebar-accent/30 pr-2 pl-7 text-sidebar-foreground text-xs sm:w-36"
									onChange={(event) => setGlobalFilter(event.target.value)}
									placeholder="Filter data..."
									value={globalFilter ?? ''}
								/>
							</div>
						)}
						{!fullScreen && (
							<button
								aria-label="Full screen"
								className="flex h-8 w-8 items-center justify-center rounded border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60"
								onClick={() => setFullScreen(true)}
								title="Full screen"
								type="button"
							>
								<ArrowsOutSimpleIcon size={16} />
							</button>
						)}
					</div>
				</div>

				{tabs && tabs.length > 1 && (
					<div className="mt-3">
						<div className="flex gap-1 border-b">
							{tabs.map((tab) => {
								const isActive = activeTab === tab.id;
								const itemCount = tab?.data?.length || 0;

								return (
									<TabButton
										isActive={isActive}
										itemCount={itemCount}
										key={tab.id}
										onTabChange={handleTabChange}
										tab={tab}
									/>
								);
							})}
						</div>
					</div>
				)}
			</div>

			<div className="overflow-hidden">
				<div
					className={cn(
						'relative transition-all duration-300 ease-out',
						isTransitioning && 'scale-[0.98] opacity-40'
					)}
					onMouseLeave={handleMouseLeave}
					onMouseMove={handleMouseMove}
					ref={tableContainerRef}
					role="tablist"
				>
					<AnimatePresence>
						{renderTooltipContent && tooltipState.visible && (
							<motion.div
								animate={{ opacity: 1, scale: 1 }}
								className="pointer-events-none absolute z-30"
								exit={{ opacity: 0, scale: 0.9 }}
								initial={{ opacity: 0, scale: 0.9 }}
								ref={tooltipRef}
								style={{
									top: 0,
									left: 0,
								}}
								transition={{ duration: 0.15, ease: 'easeOut' }}
							>
								{tooltipState.content}
							</motion.div>
						)}
					</AnimatePresence>
					{isTransitioning && (
						<div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
							<div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/80 px-3 py-2 shadow-sm">
								<div className="h-3 w-3 animate-pulse rounded-full bg-primary/60" />
								<span className="font-medium text-muted-foreground text-xs">
									Loading...
								</span>
							</div>
						</div>
					)}

					{table.getRowModel().rows.length ? (
						<div
							aria-labelledby={`tab-${activeTab}`}
							className="custom-scrollbar relative overflow-auto border-sidebar-border bg-sidebar"
							id={`tabpanel-${activeTab}`}
							role="tabpanel"
							style={{ height: minHeight }}
						>
							<Table className="w-full table-fixed">
								<TableHeader>
									{table.getHeaderGroups().map((headerGroup) => (
										<TableRow
											className="sticky top-0 z-10 border-sidebar-border/30 bg-sidebar-accent"
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
														'h-10 bg-sidebar-accent px-2 font-semibold text-sidebar-foreground/70 text-xs uppercase tracking-wide',
														(header.column.columnDef.meta as any)?.className,
														header.column.getCanSort()
															? 'group cursor-pointer select-none transition-colors hover:text-sidebar-foreground'
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
																? `${Math.min(header.getSize(), 300)}px`
																: undefined,
														maxWidth: '300px',
														minWidth: '80px',
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
																	<ArrowsDownUpIcon className="h-3 w-3 text-sidebar-foreground/40 transition-colors group-hover:text-sidebar-foreground/70" />
																)}
																{header.column.getIsSorted() === 'asc' && (
																	<ArrowUpIcon className="h-3 w-3 text-sidebar-ring" />
																)}
																{header.column.getIsSorted() === 'desc' && (
																	<ArrowDownIcon className="h-3 w-3 text-sidebar-ring" />
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
									{displayData.map((row, rowIndex) => {
										const subRows =
											expandable && getSubRows
												? getSubRows(row.original)
												: undefined;
										const hasSubRows = subRows && subRows.length > 0;
										const isExpanded = expandedRow === row.id;
										const percentage = getRowPercentage(row.original);
										const gradient = getPercentageGradient(percentage);

										return (
											<Fragment key={row.id}>
												<TableRow
													className={cn(
														'relative h-11 border-border/20 pl-3 transition-all duration-300 ease-in-out',
														(onRowClick && !hasSubRows) ||
															hasSubRows ||
															onAddFilter ||
															onRowAction
															? 'cursor-pointer'
															: '',
														hoveredRow && hoveredRow !== row.id
															? 'opacity-40 grayscale-[80%]'
															: 'opacity-100',
														!hoveredRow &&
															(rowIndex % 2 === 0
																? 'bg-background/50'
																: 'bg-muted/10')
													)}
													onClick={() => {
														if (hasSubRows) {
															toggleRowExpansion(row.id);
														} else if (onRowAction) {
															onRowAction(row.original);
														} else if (onAddFilter && row.original.name) {
															// Determine the appropriate field and value based on table context
															const activeTabConfig = tabs?.find(
																(tab) => tab.id === activeTab
															);
															const filterFunc = activeTabConfig?.getFilter;
															if (!filterFunc) {
																return;
															}

															const { field, value } = filterFunc(row.original);
															onAddFilter(field, value, title);
														} else if (onRowClick) {
															onRowClick('name', row.original.name);
														}
													}}
													onMouseEnter={() =>
														handleRowMouseEnter(row.original, row.id)
													}
													style={{
														background:
															!hoveredRow && percentage > 0
																? gradient.background
																: undefined,
														boxShadow:
															!hoveredRow && percentage > 0
																? `inset 3px 0 0 0 ${gradient.accentColor}`
																: undefined,
													}}
												>
													{row.getVisibleCells().map((cell, cellIndex) => (
														<TableCell
															className={cn(
																'px-2 py-2 font-medium text-sm transition-colors',
																cellIndex === 0 &&
																	'font-semibold text-sidebar-foreground',
																'text-sidebar-foreground/80',
																(cell.column.columnDef.meta as any)?.className
															)}
															key={cell.id}
															style={{
																width:
																	cell.column.getSize() !== 150
																		? `${Math.min(cell.column.getSize(), 300)}px`
																		: undefined,
																maxWidth: '300px',
																minWidth: '80px',
															}}
														>
															<div className="flex items-center gap-2">
																{cellIndex === 0 && hasSubRows && (
																	<button
																		aria-label={
																			isExpanded ? 'Collapse row' : 'Expand row'
																		}
																		className="flex-shrink-0 rounded p-0.5 transition-colors hover:bg-sidebar-accent/60"
																		onClick={(e) => {
																			e.stopPropagation();
																			toggleRowExpansion(row.id);
																		}}
																		type="button"
																	>
																		{isExpanded ? (
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
													isExpanded &&
													subRows.map((subRow, subIndex) => (
														<TableRow
															className="border-sidebar-border/10 bg-sidebar-accent/5 transition-colors hover:bg-sidebar-accent/10"
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
																			'py-2 text-sidebar-foreground/70 text-sm',
																			cellIndex === 0 ? 'pl-8' : 'px-2'
																		)}
																		key={`sub-${cell.id}`}
																		style={{
																			width:
																				cell.column.getSize() !== 150
																					? `${Math.min(cell.column.getSize(), 300)}px`
																					: undefined,
																			maxWidth: '300px',
																			minWidth: '80px',
																		}}
																	>
																		<div className="truncate">
																			{cellIndex === 0 ? (
																				<span className="text-xs">
																					↳{' '}
																					{(subRow as any)[cell.column.id] ||
																						''}
																				</span>
																			) : (
																				(subRow as any)[cell.column.id] || ''
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
					) : (
						<div
							className="flex flex-col items-center justify-center py-8 text-center sm:py-16"
							style={{ minHeight }}
						>
							<div className="mb-4">
								<div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/20">
									{globalFilter ? (
										<MagnifyingGlassIcon className="h-7 w-7 text-muted-foreground/50" />
									) : (
										<DatabaseIcon className="h-7 w-7 text-muted-foreground/50" />
									)}
								</div>
							</div>
							<h4 className="mb-2 font-medium text-base text-foreground">
								{globalFilter ? 'No results found' : emptyMessage}
							</h4>
							<p className="mb-4 max-w-sm text-muted-foreground text-sm">
								{globalFilter
									? `No data matches your search for "${globalFilter}". Try adjusting your search terms.`
									: 'Data will appear here when available and ready to display.'}
							</p>
							{globalFilter && (
								<button
									className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 font-medium text-primary text-sm transition-colors hover:bg-primary/15 hover:text-primary/80"
									onClick={() => setGlobalFilter('')}
									type="button"
								>
									<XIcon className="h-4 w-4" />
									Clear search
								</button>
							)}
						</div>
					)}
				</div>
			</div>
		</>
	);

	return (
		<>
			<div
				className={cn(
					'w-full overflow-hidden rounded border bg-card/50 shadow-sm backdrop-blur-sm',
					className
				)}
			>
				{renderTableContent()}
			</div>
			{hasMounted &&
				fullScreen &&
				ReactDOM.createPortal(
					<div
						className="fixed inset-0 z-[1000] flex items-center justify-center"
						ref={modalRef}
						tabIndex={-1}
					>
						{/* Backdrop */}
						<div className="absolute inset-0 animate-fadein bg-black/70 backdrop-blur-[3px] transition-opacity" />
						{/* Modal */}
						<div
							className={cn(
								'relative flex scale-100 animate-scalein flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl',
								FULLSCREEN_HEIGHT,
								FULLSCREEN_WIDTH
							)}
						>
							<FullScreenTable
								activeTab={activeTab}
								columns={tableColumns}
								data={tableData}
								description={description}
								expandable={expandable}
								getSubRows={getSubRows}
								initialPageSize={50}
								isTransitioning={isTransitioning}
								onAddFilter={onAddFilter}
								onClose={() => setFullScreen(false)}
								onTabChange={handleTabChange}
								renderSubRow={renderSubRow}
								search={globalFilter}
								showSearch={showSearch}
								tabs={tabs}
								title={title}
							/>
						</div>
					</div>,
					document.body
				)}
		</>
	);
}
