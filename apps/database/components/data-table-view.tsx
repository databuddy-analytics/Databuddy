'use client';

import {
	type ColumnDef,
	type ColumnFiltersState,
	type ColumnSizingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from '@tanstack/react-table';
import {
	ArrowUpDown,
	Binary,
	Calendar,
	Columns,
	Edit,
	Eye,
	EyeOff,
	Hash,
	MoreHorizontal,
	SortAsc,
	SortDesc,
	Trash2,
	Type,
} from 'lucide-react';
import * as React from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface TableColumn {
	name: string;
	type: string;
}

interface DataTableViewProps {
	data: Record<string, any>[];
	columns: TableColumn[];
	loading: boolean;
	onDeleteRow?: (row: Record<string, any>) => void;
	onEditRow?: (
		originalRow: Record<string, any>,
		updatedRow: Record<string, any>
	) => void;
	onHideRow?: (row: Record<string, any>) => void;
}

const selectColumn: ColumnDef<any> = {
	id: 'select',
	header: ({ table }) => (
		<Checkbox
			aria-label="Select all"
			checked={
				table.getIsAllPageRowsSelected() ||
				(table.getIsSomePageRowsSelected() && 'indeterminate')
			}
			className="mx-1"
			onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
		/>
	),
	cell: ({ row }) => (
		<Checkbox
			aria-label="Select row"
			checked={row.getIsSelected()}
			className="mx-1"
			onCheckedChange={(value) => row.toggleSelected(!!value)}
		/>
	),
	enableSorting: false,
	enableHiding: false,
	enableResizing: false,
	size: 40,
	minSize: 40,
	maxSize: 40,
};

const FieldIcon = ({
	label,
	children,
}: {
	label: string | null;
	children: React.ReactNode;
}) => {
	if (children === null) {
		return null;
	}
	return (
		<TooltipProvider delayDuration={20}>
			<Tooltip>
				<TooltipTrigger>
					<div className="flex h-4 w-4 items-center justify-center rounded-sm hover:bg-sidebar-accent">
						{children}
					</div>
				</TooltipTrigger>
				<TooltipContent
					className="border border-border bg-card text-card-foreground"
					side="bottom"
				>
					<p>{label}</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

const ValueCell = ({
	value,
	type,
	columnName,
}: {
	value: any;
	type: string;
	columnName: string;
}) => {
	const formatValue = (val: any, dataType: string, colName: string) => {
		if (val === null || val === undefined) {
			return <span className="text-muted-foreground text-xs italic">null</span>;
		}

		const stringValue = String(val);

		// Special handling for ID columns - make them very compact
		if (
			colName.toLowerCase().includes('id') ||
			colName.toLowerCase() === 'uuid'
		) {
			if (stringValue.length > 8) {
				return (
					<span
						className="block cursor-help truncate font-mono text-blue-600 text-xs"
						title={stringValue}
					>
						{stringValue.substring(0, 8)}...
					</span>
				);
			}
			return (
				<span className="font-mono text-blue-600 text-xs">{stringValue}</span>
			);
		}

		// Format different data types
		if (dataType.includes('DateTime')) {
			const truncated =
				stringValue.length > 16
					? `${stringValue.substring(0, 16)}...`
					: stringValue;
			return (
				<span
					className="cursor-help font-mono text-blue-600 text-xs"
					title={stringValue}
				>
					{truncated}
				</span>
			);
		}
		if (dataType.includes('Int') || dataType.includes('Float')) {
			return (
				<span className="text-right font-mono text-green-600 text-xs">
					{stringValue}
				</span>
			);
		}
		if (stringValue.length > 30) {
			return (
				<span
					className="block cursor-help truncate font-mono text-xs"
					title={stringValue}
				>
					{stringValue.substring(0, 30)}...
				</span>
			);
		}

		return <span className="font-mono text-xs">{stringValue}</span>;
	};

	return formatValue(value, type, columnName);
};

const getTypeIcon = (type: string) => {
	if (type.includes('DateTime')) {
		return <Calendar className="size-3 text-blue-500" />;
	}
	if (type.includes('Int') || type.includes('Float')) {
		return <Hash className="size-3 text-green-500" />;
	}
	if (type.includes('String')) {
		return <Type className="size-3 text-purple-500" />;
	}
	return <Binary className="size-3 text-gray-500" />;
};

export function DataTableView({
	data,
	columns,
	loading,
	onDeleteRow,
	onEditRow,
	onHideRow,
}: DataTableViewProps) {
	const [sorting, setSorting] = React.useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
		[]
	);
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = React.useState({});
	const [colSizing, setColSizing] = React.useState<ColumnSizingState>({});
	const [hiddenRows, setHiddenRows] = React.useState<Set<string>>(new Set());
	const [editingRow, setEditingRow] = React.useState<Record<
		string,
		any
	> | null>(null);
	const [editFormData, setEditFormData] = React.useState<Record<string, any>>(
		{}
	);
	const [confirmText, setConfirmText] = React.useState('');

	// Helper functions
	const handleEditRow = (row: Record<string, any>) => {
		setEditingRow(row);
		setEditFormData({ ...row });
	};

	const handleSaveEdit = () => {
		if (editingRow && onEditRow) {
			onEditRow(editingRow, editFormData);
			setEditingRow(null);
			setEditFormData({});
		}
	};

	const handleHideRow = (row: Record<string, any>) => {
		const rowId = JSON.stringify(row);
		setHiddenRows((prev) => new Set([...prev, rowId]));
		if (onHideRow) {
			onHideRow(row);
		}
	};

	const handleDeleteSelected = () => {
		const selectedRows = table.getSelectedRowModel().rows;
		selectedRows.forEach((row) => {
			if (onDeleteRow) {
				onDeleteRow(row.original);
			}
		});
		setRowSelection({});
	};

	const _EditDialog = () => (
		<Dialog
			onOpenChange={(open) => !open && setEditingRow(null)}
			open={!!editingRow}
		>
			<DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Edit Row</DialogTitle>
					<DialogDescription>
						Make changes to the row data. Click save when you're done.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					{columns.map((col) => (
						<div className="grid grid-cols-4 items-center gap-4" key={col.name}>
							<label
								className="text-right font-medium text-sm"
								htmlFor={col.name}
							>
								{col.name}
							</label>
							<div className="col-span-3">
								<Input
									className="w-full"
									id={col.name}
									onChange={(e) =>
										setEditFormData((prev) => ({
											...prev,
											[col.name]: e.target.value,
										}))
									}
									placeholder={`Enter ${col.name}`}
									value={editFormData[col.name] || ''}
								/>
								<p className="mt-1 text-muted-foreground text-xs">
									Type: {col.type}
								</p>
							</div>
						</div>
					))}
				</div>
				<DialogFooter>
					<Button onClick={() => setEditingRow(null)} variant="outline">
						Cancel
					</Button>
					<Button onClick={handleSaveEdit}>Save Changes</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);

	const tableColumns: ColumnDef<any>[] = React.useMemo(() => {
		const fields: ColumnDef<any>[] = columns.map((col) => {
			return {
				accessorKey: col.name,
				header: ({ column }) => (
					<div className="flex w-full min-w-0 items-center gap-3 pr-6 text-foreground">
						<FieldIcon label={`Type: ${col.type}`}>
							{getTypeIcon(col.type)}
						</FieldIcon>
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<Button
								className="flex h-auto min-w-0 items-center justify-start gap-2 p-1 font-semibold text-xs hover:bg-transparent"
								onClick={() =>
									column.toggleSorting(column.getIsSorted() === 'asc')
								}
								size="sm"
								variant="ghost"
							>
								<span className="truncate text-left font-medium">
									{col.name}
								</span>
								{column.getIsSorted() === 'asc' ? (
									<SortAsc className="h-3 w-3 flex-shrink-0" />
								) : column.getIsSorted() === 'desc' ? (
									<SortDesc className="h-3 w-3 flex-shrink-0" />
								) : (
									<ArrowUpDown className="h-3 w-3 flex-shrink-0 opacity-50" />
								)}
							</Button>
						</div>
						<Badge
							className="flex-shrink-0 px-2 py-1 text-xs"
							variant="outline"
						>
							{col.type.length > 6
								? `${col.type.substring(0, 6)}...`
								: col.type}
						</Badge>
					</div>
				),
				cell: ({ row }) => {
					const value = row.getValue(col.name) as any;
					return (
						<ValueCell columnName={col.name} type={col.type} value={value} />
					);
				},
				enableResizing: true,
				size: 250,
				minSize: 80,
				maxSize: 450,
				filterFn: 'includesString',
			};
		});

		const actionColumn: ColumnDef<any> = {
			id: 'actions',
			enableHiding: false,
			enableResizing: false,
			size: 60,
			minSize: 60,
			maxSize: 60,
			cell: ({ row }) => {
				const rowData = row.original;

				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button className="h-6 w-6 p-0" variant="ghost">
								<span className="sr-only">Open menu</span>
								<MoreHorizontal className="h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							{onEditRow && (
								<DropdownMenuItem
									className="flex items-center gap-2"
									onClick={() => handleEditRow(rowData)}
								>
									<Edit className="h-3 w-3" />
									Edit row
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								className="flex items-center gap-2"
								onClick={() => handleHideRow(rowData)}
							>
								<EyeOff className="h-3 w-3" />
								Hide row
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									const text = Object.entries(rowData)
										.map(([key, value]) => `${key}: ${value}`)
										.join('\n');
									navigator.clipboard.writeText(text);
								}}
							>
								Copy row data
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{onDeleteRow && (
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<DropdownMenuItem
											className="flex items-center gap-2 text-destructive focus:text-destructive"
											onSelect={(e) => e.preventDefault()}
										>
											<Trash2 className="h-3 w-3" />
											Delete row
										</DropdownMenuItem>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Delete Row</AlertDialogTitle>
											<AlertDialogDescription>
												Are you sure you want to delete this row? This action
												cannot be undone.
												<br />
												<br />
												Please type <strong>DELETE</strong> to confirm.
											</AlertDialogDescription>
											<Input
												className="mt-2"
												onChange={(e) => setConfirmText(e.target.value)}
												value={confirmText}
											/>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel onClick={() => setConfirmText('')}>
												Cancel
											</AlertDialogCancel>
											<AlertDialogAction
												className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
												disabled={confirmText !== 'DELETE'}
												onClick={() => {
													if (onDeleteRow) {
														onDeleteRow(rowData);
													}
													setConfirmText('');
												}}
											>
												Delete Row
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
		};

		return [selectColumn, ...fields, actionColumn];
	}, [
		columns,
		onDeleteRow,
		onEditRow,
		handleEditRow,
		handleHideRow,
		confirmText,
	]);

	// Filter out hidden rows
	const filteredData = React.useMemo(() => {
		if (!data) {
			return [];
		}
		return data.filter((row) => {
			const rowId = JSON.stringify(row);
			return !hiddenRows.has(rowId);
		});
	}, [data, hiddenRows]);

	const table = useReactTable({
		data: filteredData,
		columns: tableColumns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		onColumnSizingChange: setColSizing,
		enableColumnResizing: true,
		state: {
			sorting,
			columnFilters,
			columnVisibility,
			rowSelection,
			columnSizing: colSizing,
		},
		defaultColumn: {
			size: 150,
			minSize: 80,
			maxSize: 300,
		},
		columnResizeMode: 'onChange',
	});

	const rows = React.useMemo(() => table.getRowModel().rows, [table]);
	const selectedRowsCount = table.getSelectedRowModel().rows.length;

	// Table controls component
	const _TableControls = () => (
		<div className="flex items-center justify-between border-b bg-muted/30 p-4">
			<div className="flex items-center gap-2">
				{/* Column visibility */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button className="h-8" size="sm" variant="outline">
							<Columns className="mr-2 h-4 w-4" />
							Columns
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-48">
						{table
							.getAllColumns()
							.filter((column) => column.getCanHide())
							.map((column) => {
								return (
									<DropdownMenuCheckboxItem
										checked={column.getIsVisible()}
										className="capitalize"
										key={column.id}
										onCheckedChange={(value) =>
											column.toggleVisibility(!!value)
										}
									>
										{column.id}
									</DropdownMenuCheckboxItem>
								);
							})}
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Show hidden rows count */}
				{hiddenRows.size > 0 && (
					<Badge className="h-8" variant="secondary">
						{hiddenRows.size} hidden
						<Button
							className="ml-2 h-4 w-4 p-0"
							onClick={() => setHiddenRows(new Set())}
							size="sm"
							variant="ghost"
						>
							<Eye className="h-3 w-3" />
						</Button>
					</Badge>
				)}
			</div>

			<div className="flex items-center gap-2">
				{/* Bulk actions for selected rows */}
				{selectedRowsCount > 0 && (
					<div className="flex items-center gap-2">
						<Badge className="h-8" variant="secondary">
							{selectedRowsCount} selected
						</Badge>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button className="h-8" size="sm" variant="destructive">
									<Trash2 className="mr-1 h-3 w-3" />
									Delete Selected
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete Selected Rows</AlertDialogTitle>
									<AlertDialogDescription>
										Are you sure you want to delete {selectedRowsCount} selected
										rows? This action cannot be undone.
										<br />
										<br />
										Please type <strong>DELETE</strong> to confirm.
									</AlertDialogDescription>
									<Input
										className="mt-2"
										onChange={(e) => setConfirmText(e.target.value)}
										value={confirmText}
									/>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel onClick={() => setConfirmText('')}>
										Cancel
									</AlertDialogCancel>
									<AlertDialogAction
										className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
										disabled={confirmText !== 'DELETE'}
										onClick={() => {
											handleDeleteSelected();
											setConfirmText('');
										}}
									>
										Delete Rows
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				)}
			</div>
		</div>
	);

	// Add column filters below headers
	const renderColumnFilters = () => (
		<TableRow className="border-b hover:bg-transparent">
			{table.getHeaderGroups()[0]?.headers.map((header) => (
				<TableHead
					className="p-1"
					key={`filter-${header.id}`}
					style={{ width: header.getSize() }}
				>
					{header.column.getCanFilter() &&
					header.id !== 'select' &&
					header.id !== 'actions' ? (
						<Input
							className="h-6 px-2 text-xs"
							onChange={(e) => header.column.setFilterValue(e.target.value)}
							placeholder={'Filter...'}
							value={(header.column.getFilterValue() as string) ?? ''}
						/>
					) : null}
				</TableHead>
			))}
		</TableRow>
	);

	return (
		<Table className="table-fixed" style={{ width: table.getTotalSize() }}>
			<TableHeader className="sticky top-0 z-10 border-b bg-background">
				{table.getHeaderGroups().map((headerGroup) => (
					<TableRow
						className="h-10 hover:[&>*]:border-border"
						key={headerGroup.id}
					>
						{headerGroup.headers.map((header) => (
							<TableHead
								className="relative border border-transparent p-2 text-xs hover:[&>.resizer]:bg-border"
								key={header.id}
								style={{ width: header.getSize() }}
							>
								{header.isPlaceholder
									? null
									: flexRender(
											header.column.columnDef.header,
											header.getContext()
										)}
								<div
									className={cn(
										'resizer absolute top-0 right-0 z-10 h-full w-1 touch-none select-none transition-colors duration-150 ease-in-out',
										header.column.getIsResizing()
											? 'bg-primary/50'
											: header.column.getCanResize()
												? 'cursor-col-resize hover:bg-border'
												: 'hidden'
									)}
									onMouseDown={header.getResizeHandler()}
									onTouchStart={header.getResizeHandler()}
								/>
							</TableHead>
						))}
					</TableRow>
				))}
				{renderColumnFilters()}
			</TableHeader>
			<TableBody>
				{rows.length ? (
					rows.map((row) => (
						<TableRow
							className="h-8 hover:[&>*]:border-border"
							data-state={row.getIsSelected() && 'selected'}
							key={row.id}
						>
							{row.getVisibleCells().map((cell) => (
								<TableCell
									className="overflow-hidden border border-transparent p-2 text-xs"
									key={cell.id}
									style={{
										width: cell.column.getSize(),
									}}
								>
									<div className="truncate">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</div>
								</TableCell>
							))}
						</TableRow>
					))
				) : (
					<TableRow>
						<TableCell
							className="h-24 text-center"
							colSpan={tableColumns.length}
							style={{ width: `${table.getTotalSize()}px` }}
						>
							{loading ? 'Loading...' : 'No results.'}
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}
