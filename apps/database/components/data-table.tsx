'use client';

import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Download,
	Edit,
	RefreshCw,
	Search,
	SortAsc,
	SortDesc,
	Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';

interface QueryResult {
	data: Record<string, any>[];
	meta: Array<{ name: string; type: string }>;
	rows: number;
	statistics?: {
		elapsed: number;
		rows_read: number;
		bytes_read: number;
	};
}

interface DataTableProps {
	result: QueryResult;
	tableName?: string;
	onDeleteRow?: (rowData: Record<string, any>) => void;
	onEditRow?: (rowData: Record<string, any>) => void;
	onRefresh?: () => void;
	loading?: boolean;
}

export function DataTable({
	result,
	tableName,
	onDeleteRow,
	onEditRow,
	onRefresh,
	loading = false,
}: DataTableProps) {
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(50);
	const [searchTerm, setSearchTerm] = useState('');
	const [sortColumn, setSortColumn] = useState<string | null>(null);
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
	const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
		{}
	);

	// Filter and sort data
	const filteredAndSortedData = useMemo(() => {
		let filtered = result.data;

		// Apply search filter
		if (searchTerm) {
			filtered = filtered.filter((row) =>
				Object.values(row).some((value) =>
					String(value).toLowerCase().includes(searchTerm.toLowerCase())
				)
			);
		}

		// Apply column filters
		Object.entries(columnFilters).forEach(([column, filter]) => {
			if (filter) {
				filtered = filtered.filter((row) =>
					String(row[column]).toLowerCase().includes(filter.toLowerCase())
				);
			}
		});

		// Apply sorting
		if (sortColumn) {
			filtered = [...filtered].sort((a, b) => {
				const aVal = a[sortColumn];
				const bVal = b[sortColumn];

				// Handle null/undefined values
				if (aVal == null && bVal == null) {
					return 0;
				}
				if (aVal == null) {
					return sortDirection === 'asc' ? -1 : 1;
				}
				if (bVal == null) {
					return sortDirection === 'asc' ? 1 : -1;
				}

				// Handle numbers
				const aNum = Number(aVal);
				const bNum = Number(bVal);
				if (!(Number.isNaN(aNum) || Number.isNaN(bNum))) {
					return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
				}

				// Handle strings
				const aStr = String(aVal).toLowerCase();
				const bStr = String(bVal).toLowerCase();
				if (sortDirection === 'asc') {
					return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
				}
				return aStr > bStr ? -1 : aStr < bStr ? 1 : 0;
			});
		}

		return filtered;
	}, [result.data, searchTerm, sortColumn, sortDirection, columnFilters]);

	// Pagination
	const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
	const startIndex = (currentPage - 1) * pageSize;
	const endIndex = startIndex + pageSize;
	const paginatedData = filteredAndSortedData.slice(startIndex, endIndex);

	// Reset pagination when filters change
	useState(() => {
		setCurrentPage(1);
	}, [searchTerm, columnFilters, sortColumn, sortDirection]);

	const handleSort = (column: string) => {
		if (sortColumn === column) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
		} else {
			setSortColumn(column);
			setSortDirection('asc');
		}
	};

	const handleColumnFilter = (column: string, value: string) => {
		setColumnFilters((prev) => ({
			...prev,
			[column]: value,
		}));
	};

	const exportToCSV = () => {
		const headers = result.meta?.map((col) => col.name).join(',') || '';
		const rows = filteredAndSortedData
			.map((row) =>
				result.meta
					?.map((col) => {
						const value = row[col.name];
						// Escape commas and quotes in CSV
						if (
							typeof value === 'string' &&
							(value.includes(',') || value.includes('"'))
						) {
							return `"${value.replace(/"/g, '""')}"`;
						}
						return value;
					})
					.join(',')
			)
			.join('\n');

		const csv = `${headers}\n${rows}`;
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${tableName || 'query-result'}-${new Date().toISOString().slice(0, 10)}.csv`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const formatBytes = (bytes: number) => {
		if (bytes === 0) {
			return '0 B';
		}
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
	};

	const formatNumber = (num: number) => {
		return new Intl.NumberFormat().format(num);
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							{tableName ? `Table Data: ${tableName}` : 'Query Results'}
							{loading && <RefreshCw className="h-4 w-4 animate-spin" />}
						</CardTitle>
						<CardDescription>
							{formatNumber(filteredAndSortedData.length)} of{' '}
							{formatNumber(result.rows)} rows
							{result.statistics && (
								<span className="ml-2">
									• {result.statistics.elapsed.toFixed(2)}ms •{' '}
									{formatNumber(result.statistics.rows_read)} rows read •{' '}
									{formatBytes(result.statistics.bytes_read)} processed
								</span>
							)}
						</CardDescription>
					</div>
					<div className="flex items-center gap-2">
						{onRefresh && (
							<Button
								disabled={loading}
								onClick={onRefresh}
								size="sm"
								variant="outline"
							>
								<RefreshCw className="h-4 w-4" />
								Refresh
							</Button>
						)}
						<Button onClick={exportToCSV} size="sm" variant="outline">
							<Download className="h-4 w-4" />
							Export CSV
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Search and Filters */}
				<div className="flex items-center gap-4">
					<div className="relative max-w-sm flex-1">
						<Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
						<Input
							className="pl-8"
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search all columns..."
							value={searchTerm}
						/>
					</div>
					<Select
						onValueChange={(value) => setPageSize(Number(value))}
						value={pageSize.toString()}
					>
						<SelectTrigger className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="25">25 rows</SelectItem>
							<SelectItem value="50">50 rows</SelectItem>
							<SelectItem value="100">100 rows</SelectItem>
							<SelectItem value="200">200 rows</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Data Table */}
				<div className="rounded border">
					<ScrollArea className="h-96 w-full">
						<Table>
							<TableHeader className="sticky top-0 bg-background">
								<TableRow>
									{result.meta?.map((col) => (
										<TableHead className="min-w-32" key={col.name}>
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<Button
														className="h-auto p-0 font-semibold hover:bg-transparent"
														onClick={() => handleSort(col.name)}
														size="sm"
														variant="ghost"
													>
														{col.name}
														{sortColumn === col.name &&
															(sortDirection === 'asc' ? (
																<SortAsc className="ml-1 h-3 w-3" />
															) : (
																<SortDesc className="ml-1 h-3 w-3" />
															))}
													</Button>
													<Badge className="text-xs" variant="outline">
														{col.type}
													</Badge>
												</div>
												<Input
													className="h-7 text-xs"
													onChange={(e) =>
														handleColumnFilter(col.name, e.target.value)
													}
													placeholder={`Filter ${col.name}...`}
													value={columnFilters[col.name] || ''}
												/>
											</div>
										</TableHead>
									))}
									{(onEditRow || onDeleteRow) && (
										<TableHead className="w-24">Actions</TableHead>
									)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{paginatedData.length === 0 ? (
									<TableRow>
										<TableCell
											className="py-8 text-center text-muted-foreground"
											colSpan={
												(result.meta?.length || 0) +
												(onEditRow || onDeleteRow ? 1 : 0)
											}
										>
											No data found
										</TableCell>
									</TableRow>
								) : (
									paginatedData.map((row, index) => (
										<TableRow key={startIndex + index}>
											{result.meta?.map((col) => (
												<TableCell className="max-w-xs" key={col.name}>
													<div
														className="truncate"
														title={String(row[col.name] ?? '')}
													>
														{row[col.name] === null ||
														row[col.name] === undefined ? (
															<span className="text-muted-foreground italic">
																null
															</span>
														) : (
															String(row[col.name])
														)}
													</div>
												</TableCell>
											))}
											{(onEditRow || onDeleteRow) && (
												<TableCell>
													<div className="flex items-center gap-1">
														{onEditRow && (
															<Button
																onClick={() => onEditRow(row)}
																size="sm"
																title="Edit row"
																variant="ghost"
															>
																<Edit className="h-3 w-3" />
															</Button>
														)}
														{onDeleteRow && (
															<AlertDialog>
																<AlertDialogTrigger asChild>
																	<Button
																		size="sm"
																		title="Delete row"
																		variant="ghost"
																	>
																		<Trash2 className="h-3 w-3" />
																	</Button>
																</AlertDialogTrigger>
																<AlertDialogContent>
																	<AlertDialogHeader>
																		<AlertDialogTitle>
																			Delete Row
																		</AlertDialogTitle>
																		<AlertDialogDescription>
																			Are you sure you want to delete this row?
																			This action cannot be undone.
																		</AlertDialogDescription>
																	</AlertDialogHeader>
																	<AlertDialogFooter>
																		<AlertDialogCancel>
																			Cancel
																		</AlertDialogCancel>
																		<AlertDialogAction
																			className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
																			onClick={() => onDeleteRow(row)}
																		>
																			Delete Row
																		</AlertDialogAction>
																	</AlertDialogFooter>
																</AlertDialogContent>
															</AlertDialog>
														)}
													</div>
												</TableCell>
											)}
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</ScrollArea>
				</div>

				{/* Pagination */}
				{totalPages > 1 && (
					<div className="flex items-center justify-between">
						<div className="text-muted-foreground text-sm">
							Showing {startIndex + 1} to{' '}
							{Math.min(endIndex, filteredAndSortedData.length)} of{' '}
							{formatNumber(filteredAndSortedData.length)} results
						</div>
						<div className="flex items-center gap-2">
							<Button
								disabled={currentPage === 1}
								onClick={() => setCurrentPage(1)}
								size="sm"
								variant="outline"
							>
								<ChevronsLeft className="h-4 w-4" />
							</Button>
							<Button
								disabled={currentPage === 1}
								onClick={() => setCurrentPage(currentPage - 1)}
								size="sm"
								variant="outline"
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<span className="text-sm">
								Page {currentPage} of {totalPages}
							</span>
							<Button
								disabled={currentPage === totalPages}
								onClick={() => setCurrentPage(currentPage + 1)}
								size="sm"
								variant="outline"
							>
								<ChevronRight className="h-4 w-4" />
							</Button>
							<Button
								disabled={currentPage === totalPages}
								onClick={() => setCurrentPage(totalPages)}
								size="sm"
								variant="outline"
							>
								<ChevronsRight className="h-4 w-4" />
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
