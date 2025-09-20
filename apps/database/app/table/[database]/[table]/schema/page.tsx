'use client';

import {
	ArrowLeft,
	BarChart2,
	Database,
	Download,
	Edit,
	Plus,
	RefreshCw,
	Save,
	Table as TableIcon,
	Trash2,
	Upload,
	X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TableTabs } from '@/components/table-tabs';
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ColumnInfo {
	name: string;
	type: string;
	default_type: string;
	default_expression: string;
	comment: string;
	codec_expression: string;
	ttl_expression: string;
	is_in_partition_key: number;
	is_in_sorting_key: number;
	is_in_primary_key: number;
	is_in_sampling_key: number;
}

interface ColumnStats {
	unique_count?: number;
	non_default_count?: number;
	loading: boolean;
	error?: string;
}

interface TableInfo {
	database: string;
	name: string;
	engine: string;
	create_table_query: string;
	total_rows: string;
	total_bytes: string;
}

const CLICKHOUSE_TYPES = [
	'String',
	'FixedString(N)',
	'UUID',
	'Int8',
	'Int16',
	'Int32',
	'Int64',
	'UInt8',
	'UInt16',
	'UInt32',
	'UInt64',
	'Float32',
	'Float64',
	'Decimal(P, S)',
	'Decimal32(S)',
	'Decimal64(S)',
	'Decimal128(S)',
	'Bool',
	'Date',
	'Date32',
	'DateTime',
	'DateTime64',
	'Enum8',
	'Enum16',
	'Array(T)',
	'Tuple(T1, T2, ...)',
	'Map(K, V)',
	'Nullable(T)',
	'LowCardinality(T)',
	'JSON',
	'IPv4',
	'IPv6',
];

const TRANSFORMATION_MAP: Record<
	string,
	{ label: string; expression: (col: string) => string }
> = {
	toUnixTimestamp: {
		label: 'toUnixTimestamp(source)',
		expression: (col) => `toUnixTimestamp(${col})`,
	},
	toString: {
		label: 'toString(source)',
		expression: (col) => `toString(${col})`,
	},
	toUpperCase: {
		label: 'toUpperCase(source)',
		expression: (col) => `upper(${col})`,
	},
	toLowerCase: {
		label: 'toLowerCase(source)',
		expression: (col) => `lower(${col})`,
	},
	toDate: {
		label: 'toDate(source)',
		expression: (col) => `toDate(${col})`,
	},
};

export default async function TableSchemaPage({
	params,
}: {
	params: Promise<{ database: string; table: string }>;
}) {
	const { database, table } = await params;
	const [columns, setColumns] = useState<ColumnInfo[]>([]);
	const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editingColumn, setEditingColumn] = useState<ColumnInfo | null>(null);
	const [columnStats, setColumnStats] = useState<Record<string, ColumnStats>>(
		{}
	);
	const [newColumn, setNewColumn] = useState({
		name: '',
		type: 'String',
		default_expression: '',
		comment: '',
	});
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showImportDialog, setShowImportDialog] = useState(false);
	const [_importedSchemaFile, setImportedSchemaFile] = useState<File | null>(
		null
	);
	const [confirmText, setConfirmText] = useState('');
	const [schemaDiff, setSchemaDiff] = useState<{
		added: any[];
		dropped: any[];
		modified: any[];
	} | null>(null);
	const [backfillSource, setBackfillSource] = useState<string | null>(null);
	const router = useRouter();

	const tableName = `${database}.${table}`;

	const loadTableSchema = async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch('/api/database/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: `DESCRIBE TABLE ${tableName}`,
				}),
			});
			const result = await response.json();
			if (result.success) {
				setColumns(result.data.data);
			} else {
				setError(result.error);
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to load table schema'
			);
		} finally {
			setLoading(false);
		}
	};

	const loadTableInfo = async () => {
		try {
			const response = await fetch('/api/database/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: `
            SELECT 
              database,
              name,
              engine,
              create_table_query,
              total_rows,
              formatReadableSize(total_bytes) as total_bytes
            FROM system.tables 
            WHERE database = '${database}' 
              AND name = '${table}'
          `,
				}),
			});
			const result = await response.json();
			if (result.success && result.data.length > 0) {
				setTableInfo(result.data[0]);
			}
		} catch (err) {
			console.error('Failed to load table info:', err);
		}
	};

	useEffect(() => {
		loadTableSchema();
		loadTableInfo();
	}, [loadTableInfo, loadTableSchema]);

	useEffect(() => {
		if (backfillSource) {
			const sourceColumn = columns.find((c) => c.name === backfillSource);
			if (sourceColumn) {
				let expression = `${sourceColumn.name}`; // Default to direct copy
				// Suggest a transformation based on type
				if (sourceColumn.type.includes('DateTime')) {
					expression = `toUnixTimestamp(${sourceColumn.name})`;
				} else if (sourceColumn.type.includes('String')) {
					expression = `concat(${sourceColumn.name}, '_copy')`;
				}
				setNewColumn((prev) => ({ ...prev, default_expression: expression }));
			}
		}
	}, [backfillSource, columns]);

	const addColumn = async () => {
		if (!(newColumn.name && newColumn.type)) {
			setError('Column name and type are required');
			return;
		}

		setLoading(true);
		try {
			let query = `ALTER TABLE ${tableName} ADD COLUMN ${newColumn.name} ${newColumn.type}`;

			if (newColumn.default_expression) {
				query += ` DEFAULT ${newColumn.default_expression}`;
			}

			if (newColumn.comment) {
				query += ` COMMENT '${newColumn.comment}'`;
			}

			const response = await fetch('/api/database/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query }),
			});

			const result = await response.json();
			if (result.success) {
				setShowAddDialog(false);
				setNewColumn({
					name: '',
					type: 'String',
					default_expression: '',
					comment: '',
				});
				loadTableSchema();
			} else {
				setError(result.error);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add column');
		} finally {
			setLoading(false);
		}
	};

	const updateColumn = async (column: ColumnInfo) => {
		setLoading(true);
		try {
			// ClickHouse doesn't support direct column modification, so we need to be careful
			// For now, we'll only support comment updates
			const query = `ALTER TABLE ${tableName} COMMENT COLUMN ${column.name} '${column.comment}'`;

			const response = await fetch('/api/database/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query }),
			});

			const result = await response.json();
			if (result.success) {
				setEditingColumn(null);
				loadTableSchema();
			} else {
				setError(result.error);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update column');
		} finally {
			setLoading(false);
		}
	};

	const dropColumn = async (columnName: string) => {
		setLoading(true);
		try {
			const response = await fetch('/api/database/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`,
				}),
			});

			const result = await response.json();
			if (result.success) {
				loadTableSchema();
			} else {
				setError(result.error);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to drop column');
		} finally {
			setLoading(false);
		}
	};

	const loadColumnStats = async (column: ColumnInfo) => {
		setColumnStats((prev) => ({ ...prev, [column.name]: { loading: true } }));

		try {
			// Query for unique count
			const uniqueQuery = `SELECT count(DISTINCT "${column.name}") as unique_count FROM ${tableName}`;
			const uniqueResponse = await fetch('/api/database/query', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: uniqueQuery }),
			});
			const uniqueResult = await uniqueResponse.json();
			if (!uniqueResult.success) {
				throw new Error(uniqueResult.error);
			}
			const unique_count = uniqueResult.data.data[0].unique_count;

			let non_default_count: number | undefined;
			if (column.default_expression) {
				const nonDefaultQuery = `SELECT count() as non_default_count FROM ${tableName} WHERE "${column.name}" != ${column.default_expression}`;
				const nonDefaultResponse = await fetch('/api/database/query', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ query: nonDefaultQuery }),
				});
				const nonDefaultResult = await nonDefaultResponse.json();
				if (!nonDefaultResult.success) {
					throw new Error(nonDefaultResult.error);
				}
				non_default_count = nonDefaultResult.data.data[0].non_default_count;
			}

			setColumnStats((prev) => ({
				...prev,
				[column.name]: {
					loading: false,
					unique_count,
					non_default_count,
				},
			}));
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : 'Failed to load stats';
			setColumnStats((prev) => ({
				...prev,
				[column.name]: {
					loading: false,
					error: errorMessage,
				},
			}));
		}
	};

	const downloadColumn = async (columnName: string) => {
		try {
			const response = await fetch('/api/database/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tableName,
					query: `SELECT "${columnName}" FROM ${tableName}`,
				}),
			});

			if (response.ok) {
				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${tableName}_${columnName}.csv`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				window.URL.revokeObjectURL(url);
			} else {
				const result = await response.json();
				setError(result.error || 'Failed to download column');
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to download column'
			);
		}
	};

	const exportSchema = () => {
		try {
			const schemaToExport = {
				columns: columns.map((c) => ({
					name: c.name,
					type: c.type,
					default_type: c.default_type,
					default_expression: c.default_expression,
					comment: c.comment,
				})),
			};
			const jsonString = JSON.stringify(schemaToExport, null, 2);
			const blob = new Blob([jsonString], { type: 'application/json' });
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${tableName}_schema.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to export schema');
		}
	};

	const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			setImportedSchemaFile(file);
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const content = e.target?.result;
					if (typeof content === 'string') {
						const importedSchema = JSON.parse(content);
						if (
							importedSchema.columns &&
							Array.isArray(importedSchema.columns)
						) {
							calculateSchemaDiff(columns, importedSchema.columns);
						} else {
							setError(
								"Invalid schema file format. Must contain a 'columns' array."
							);
							setSchemaDiff(null);
						}
					}
				} catch (_err) {
					setError(
						'Failed to parse schema file. Please ensure it is valid JSON.'
					);
					setSchemaDiff(null);
				}
			};
			reader.readAsText(file);
		}
	};

	const calculateSchemaDiff = (
		currentCols: ColumnInfo[],
		importedCols: any[]
	) => {
		const currentColsMap = new Map(currentCols.map((c) => [c.name, c]));
		const importedColsMap = new Map(importedCols.map((c) => [c.name, c]));

		const added = importedCols.filter((c) => !currentColsMap.has(c.name));
		const dropped = currentCols.filter((c) => !importedColsMap.has(c.name));

		const modified = importedCols
			.filter((ic) => {
				const cc = currentColsMap.get(ic.name);
				return (
					cc &&
					(cc.type !== ic.type ||
						cc.default_expression !== ic.default_expression ||
						cc.comment !== ic.comment)
				);
			})
			.map((ic) => ({
				old: currentColsMap.get(ic.name),
				new: ic,
			}));

		setSchemaDiff({ added, dropped, modified });
	};

	const applySchemaChanges = async () => {
		if (!schemaDiff) {
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const queries: string[] = [];

			for (const col of schemaDiff.dropped) {
				queries.push(`ALTER TABLE ${tableName} DROP COLUMN ${col.name}`);
			}

			for (const col of schemaDiff.added) {
				let q = `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`;
				if (col.default_expression) {
					q += ` DEFAULT ${col.default_expression}`;
				}
				if (col.comment) {
					q += ` COMMENT '${col.comment}'`;
				}
				queries.push(q);
			}

			for (const mod of schemaDiff.modified) {
				if (mod.old.type !== mod.new.type) {
					queries.push(
						`ALTER TABLE ${tableName} MODIFY COLUMN ${mod.new.name} ${mod.new.type}`
					);
				}
				if (mod.old.comment !== mod.new.comment) {
					queries.push(
						`ALTER TABLE ${tableName} COMMENT COLUMN ${mod.new.name} '${mod.new.comment}'`
					);
				}
			}

			for (const query of queries) {
				const response = await fetch('/api/database/query', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ query }),
				});
				const result = await response.json();
				if (!result.success) {
					throw new Error(`Query failed: ${query}\nError: ${result.error}`);
				}
			}

			setShowImportDialog(false);
			setImportedSchemaFile(null);
			setSchemaDiff(null);
			loadTableSchema();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Failed to apply schema changes'
			);
		} finally {
			setLoading(false);
		}
	};

	const hasDestructiveChanges = schemaDiff && schemaDiff.dropped.length > 0;
	const isConfirmRequired = hasDestructiveChanges && confirmText !== 'confirm';

	const getColumnBadges = (column: ColumnInfo) => {
		const badges: any[] = [];
		if (column.is_in_primary_key) {
			badges.push({ label: 'PK', variant: 'default' as const });
		}
		if (column.is_in_partition_key) {
			badges.push({ label: 'PART', variant: 'secondary' as const });
		}
		if (column.is_in_sorting_key) {
			badges.push({ label: 'SORT', variant: 'outline' as const });
		}
		if (column.is_in_sampling_key) {
			badges.push({ label: 'SAMPLE', variant: 'outline' as const });
		}
		return badges;
	};

	return (
		<div className="flex h-full w-full flex-col overflow-hidden bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-b bg-muted/30 p-4">
				<div className="flex items-center gap-4">
					<Button
						className="flex items-center gap-2"
						onClick={() => router.push(`/table/${database}/${table}`)}
						size="sm"
						variant="ghost"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Data
					</Button>
					<div className="flex items-center gap-2">
						<Database className="h-5 w-5 text-muted-foreground" />
						<span className="text-muted-foreground text-sm">{database}</span>
						<span className="text-muted-foreground">/</span>
						<TableIcon className="h-5 w-5 text-muted-foreground" />
						<span className="font-medium">{table}</span>
						<Badge variant="outline">Schema</Badge>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button
						className="flex items-center gap-2"
						disabled={loading}
						onClick={loadTableSchema}
						size="sm"
						variant="outline"
					>
						<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
						Refresh
					</Button>
					<Dialog onOpenChange={setShowAddDialog} open={showAddDialog}>
						<DialogTrigger asChild>
							<Button className="flex items-center gap-2" size="sm">
								<Plus className="h-4 w-4" />
								Add Column
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>Add New Column</DialogTitle>
								<DialogDescription>
									Add a new column to the table. Make sure to choose the
									appropriate data type.
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
								<div className="grid grid-cols-4 items-center gap-4">
									<Label className="text-right" htmlFor="column-name">
										Name
									</Label>
									<Input
										className="col-span-3"
										id="column-name"
										onChange={(e) =>
											setNewColumn((prev) => ({
												...prev,
												name: e.target.value,
											}))
										}
										placeholder="column_name"
										value={newColumn.name}
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label className="text-right" htmlFor="column-type">
										Type
									</Label>
									<Select
										onValueChange={(value) =>
											setNewColumn((prev) => ({ ...prev, type: value }))
										}
										value={newColumn.type}
									>
										<SelectTrigger className="col-span-3">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{CLICKHOUSE_TYPES.map((type) => (
												<SelectItem key={type} value={type}>
													{type}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label className="text-right" htmlFor="column-default">
										Default
									</Label>
									<Input
										className="col-span-3"
										id="column-default"
										onChange={(e) =>
											setNewColumn((prev) => ({
												...prev,
												default_expression: e.target.value,
											}))
										}
										placeholder="DEFAULT value or expression"
										value={newColumn.default_expression}
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label className="text-right" htmlFor="column-comment">
										Comment
									</Label>
									<Input
										className="col-span-3"
										id="column-comment"
										onChange={(e) =>
											setNewColumn((prev) => ({
												...prev,
												comment: e.target.value,
											}))
										}
										placeholder="Optional comment"
										value={newColumn.comment}
									/>
								</div>
							</div>

							<div className="space-y-2 border-t pt-4">
								<h4 className="font-medium">Backfill Helper</h4>
								<p className="text-muted-foreground text-sm">
									Optionally, create this column's data from an existing column.
								</p>
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-1">
										<Label>Source Column</Label>
										<Select
											onValueChange={(value) => setBackfillSource(value)}
											value={backfillSource || ''}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a column" />
											</SelectTrigger>
											<SelectContent>
												{columns.map((c) => (
													<SelectItem key={c.name} value={c.name}>
														{c.name} ({c.type})
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-1">
										<Label>Transformation</Label>
										<Select
											disabled={!backfillSource}
											onValueChange={(value) => {
												if (backfillSource) {
													const expression =
														TRANSFORMATION_MAP[value]?.expression(
															backfillSource
														);
													if (expression) {
														setNewColumn((prev) => ({
															...prev,
															default_expression: expression,
														}));
													}
												}
											}}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select a function" />
											</SelectTrigger>
											<SelectContent>
												{Object.entries(TRANSFORMATION_MAP).map(
													([key, { label }]) => (
														<SelectItem key={key} value={key}>
															{label}
														</SelectItem>
													)
												)}
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="mt-2">
									<Label>Generated Expression (for DEFAULT clause)</Label>
									<Input
										onChange={(e) => {
											setBackfillSource(null); // Manual edit overrides helper
											setNewColumn((prev) => ({
												...prev,
												default_expression: e.target.value,
											}));
										}}
										placeholder="e.g., toUnixTimestamp(source)"
										value={newColumn.default_expression}
									/>
								</div>
							</div>

							<DialogFooter>
								<Button
									onClick={() => setShowAddDialog(false)}
									variant="outline"
								>
									Cancel
								</Button>
								<Button disabled={loading} onClick={addColumn}>
									Add Column
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
					<Button
						className="flex items-center gap-2"
						onClick={() => setShowImportDialog(true)}
						size="sm"
						variant="outline"
					>
						<Upload className="h-4 w-4" />
						Import
					</Button>
					<Button
						className="flex items-center gap-2"
						onClick={exportSchema}
						size="sm"
						variant="outline"
					>
						<Download className="h-4 w-4" />
						Export
					</Button>
				</div>
			</div>

			{/* Tabs */}
			<TableTabs database={database} table={table} />

			{/* Error Display */}
			{error && (
				<div className="flex-shrink-0 border-destructive/20 border-b bg-destructive/10 px-4 py-2">
					<p className="text-destructive text-sm">{error}</p>
				</div>
			)}

			<div className="flex-1 space-y-6 overflow-auto p-4">
				{/* Table Info */}
				{tableInfo && (
					<Card>
						<CardHeader>
							<CardTitle>Table Information</CardTitle>
							<CardDescription>
								Basic information about the table
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
								<div>
									<Label className="font-medium text-muted-foreground text-sm">
										Engine
									</Label>
									<p className="font-mono text-sm">{tableInfo.engine}</p>
								</div>
								<div>
									<Label className="font-medium text-muted-foreground text-sm">
										Total Rows
									</Label>
									<p className="font-mono text-sm">{tableInfo.total_rows}</p>
								</div>
								<div>
									<Label className="font-medium text-muted-foreground text-sm">
										Size
									</Label>
									<p className="font-mono text-sm">{tableInfo.total_bytes}</p>
								</div>
								<div>
									<Label className="font-medium text-muted-foreground text-sm">
										Columns
									</Label>
									<p className="font-mono text-sm">{columns?.length || 0}</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Schema Table */}
				<Card>
					<CardHeader>
						<CardTitle>Table Schema</CardTitle>
						<CardDescription>
							Manage columns, data types, and constraints for {tableName}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Column Name</TableHead>
									<TableHead>Data Type</TableHead>
									<TableHead>Default</TableHead>
									<TableHead>Comment</TableHead>
									<TableHead>Properties</TableHead>
									<TableHead>Stats</TableHead>
									<TableHead className="w-24">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{columns && columns.length > 0 ? (
									columns.map((column) => (
										<TableRow key={column.name}>
											<TableCell className="font-medium font-mono">
												{column.name}
											</TableCell>
											<TableCell className="font-mono text-sm">
												{column.type}
											</TableCell>
											<TableCell className="font-mono text-muted-foreground text-sm">
												{column.default_expression || '-'}
											</TableCell>
											<TableCell className="text-sm">
												{editingColumn?.name === column.name ? (
													<div className="flex items-center gap-2">
														<Input
															className="h-8 text-xs"
															onChange={(e) =>
																setEditingColumn((prev) =>
																	prev
																		? { ...prev, comment: e.target.value }
																		: null
																)
															}
															value={editingColumn.comment}
														/>
														<Button
															className="h-8 w-8 p-0"
															onClick={() => updateColumn(editingColumn)}
															size="sm"
															variant="ghost"
														>
															<Save className="h-3 w-3" />
														</Button>
														<Button
															className="h-8 w-8 p-0"
															onClick={() => setEditingColumn(null)}
															size="sm"
															variant="ghost"
														>
															<X className="h-3 w-3" />
														</Button>
													</div>
												) : (
													column.comment || '-'
												)}
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{getColumnBadges(column).map((badge, index) => (
														<Badge
															className="text-xs"
															key={index}
															variant={badge.variant}
														>
															{badge.label}
														</Badge>
													))}
												</div>
											</TableCell>
											<TableCell>
												{columnStats[column.name] ? (
													<div className="text-xs">
														{columnStats[column.name].loading ? (
															<div className="flex items-center gap-2">
																<RefreshCw className="h-3 w-3 animate-spin" />
																<span>Loading...</span>
															</div>
														) : columnStats[column.name].error ? (
															<span className="text-destructive">
																{columnStats[column.name].error}
															</span>
														) : (
															<>
																<div>
																	<strong>Unique:</strong>{' '}
																	{columnStats[column.name].unique_count}
																</div>
																{columnStats[column.name].non_default_count !==
																	undefined && (
																	<div>
																		<strong>Non-Default:</strong>{' '}
																		{columnStats[column.name].non_default_count}
																	</div>
																)}
															</>
														)}
													</div>
												) : (
													<Button
														className="h-8 w-8 p-0"
														onClick={() => loadColumnStats(column)}
														size="sm"
														title="Calculate stats"
														variant="ghost"
													>
														<BarChart2 className="h-3 w-3" />
													</Button>
												)}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-1">
													<Button
														className="h-8 w-8 p-0"
														onClick={() => setEditingColumn(column)}
														size="sm"
														title="Edit comment"
														variant="ghost"
													>
														<Edit className="h-3 w-3" />
													</Button>
													<Button
														className="h-8 w-8 p-0"
														onClick={() => downloadColumn(column.name)}
														size="sm"
														title="Download column data"
														variant="ghost"
													>
														<Download className="h-3 w-3" />
													</Button>
													<AlertDialog>
														<AlertDialogTrigger asChild>
															<Button
																className="h-8 w-8 p-0 text-destructive hover:text-destructive"
																size="sm"
																title="Drop column"
																variant="ghost"
															>
																<Trash2 className="h-3 w-3" />
															</Button>
														</AlertDialogTrigger>
														<AlertDialogContent>
															<AlertDialogHeader>
																<AlertDialogTitle>Drop Column</AlertDialogTitle>
																<AlertDialogDescription>
																	Are you sure you want to drop the column "
																	{column.name}"? This action cannot be undone
																	and will permanently delete all data in this
																	column.
																	<br />
																	<br />
																	Please type <strong>{column.name}</strong> to
																	confirm.
																</AlertDialogDescription>
																<Input
																	className="mt-2"
																	onChange={(e) =>
																		setConfirmText(e.target.value)
																	}
																	value={confirmText}
																/>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel
																	onClick={() => setConfirmText('')}
																>
																	Cancel
																</AlertDialogCancel>
																<AlertDialogAction
																	className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
																	disabled={confirmText !== column.name}
																	onClick={() => dropColumn(column.name)}
																>
																	Drop Column
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												</div>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell className="h-24 text-center" colSpan={6}>
											{loading ? 'Loading schema...' : 'No columns found.'}
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</CardContent>
				</Card>

				{/* Create Table Query */}
				{tableInfo?.create_table_query && (
					<Card>
						<CardHeader>
							<CardTitle>CREATE TABLE Statement</CardTitle>
							<CardDescription>
								The SQL statement used to create this table
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Textarea
								className="min-h-32 resize-none font-mono text-sm"
								readOnly
								value={tableInfo.create_table_query}
							/>
						</CardContent>
					</Card>
				)}
			</div>

			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setShowImportDialog(false);
						setImportedSchemaFile(null);
						setSchemaDiff(null);
						setError(null);
					}
				}}
				open={showImportDialog}
			>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Import Schema</DialogTitle>
						<DialogDescription>
							Upload a schema JSON file to compare and apply changes.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="grid w-full max-w-sm items-center gap-1.5">
							<Label htmlFor="schema-file">Schema File (.json)</Label>
							<Input
								accept=".json"
								id="schema-file"
								onChange={handleFileImport}
								type="file"
							/>
						</div>

						{schemaDiff && (
							<div className="max-h-96 overflow-y-auto">
								<h3 className="mb-2 font-semibold">Schema Changes</h3>
								{schemaDiff.added.length > 0 && (
									<div>
										<h4 className="font-medium text-green-600">
											Columns to Add
										</h4>
										<pre className="rounded bg-muted p-2 text-xs">
											{JSON.stringify(schemaDiff.added, null, 2)}
										</pre>
									</div>
								)}
								{schemaDiff.modified.length > 0 && (
									<div className="mt-2">
										<h4 className="font-medium text-yellow-600">
											Columns to Modify
										</h4>
										<pre className="rounded bg-muted p-2 text-xs">
											{JSON.stringify(schemaDiff.modified, null, 2)}
										</pre>
									</div>
								)}
								{schemaDiff.dropped.length > 0 && (
									<div className="mt-2">
										<h4 className="font-medium text-red-600">
											Columns to Drop
										</h4>
										<pre className="rounded bg-muted p-2 text-xs">
											{JSON.stringify(schemaDiff.dropped, null, 2)}
										</pre>
									</div>
								)}
							</div>
						)}
						{hasDestructiveChanges && (
							<div className="mt-4">
								<Label>
									This action includes dropping columns, which is irreversible.
									Please type <strong>confirm</strong> to proceed.
								</Label>
								<Input
									className="mt-1"
									onChange={(e) => setConfirmText(e.target.value)}
									value={confirmText}
								/>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							onClick={() => setShowImportDialog(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={!schemaDiff || loading || isConfirmRequired}
							onClick={applySchemaChanges}
						>
							{loading ? 'Applying...' : 'Apply Changes'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
