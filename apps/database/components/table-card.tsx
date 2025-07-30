'use client';

import { BarChart3, Download, Eye, Trash2 } from 'lucide-react';
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
import { Card, CardContent } from '@/components/ui/card';

interface TableInfo {
	name: string;
	database: string;
	engine: string;
	total_rows: number;
	total_bytes: number;
}

interface TableCardProps {
	table: TableInfo;
	onViewData: (tableName: string) => void;
	onDropTable: (tableName: string) => void;
	onExportData?: (tableName: string) => void;
	onAnalyze?: (tableName: string) => void;
	loading?: boolean;
}

export function TableCard({
	table,
	onViewData,
	onDropTable,
	onExportData,
	onAnalyze,
	loading = false,
}: TableCardProps) {
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

	const fullTableName = `${table.database}.${table.name}`;

	return (
		<Card className="transition-all hover:shadow-md">
			<CardContent className="p-4">
				<div className="flex items-center justify-between">
					<div className="flex-1 space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="font-semibold text-lg">{table.name}</h3>
							<Badge variant="secondary">{table.engine}</Badge>
							<Badge variant="outline">{table.database}</Badge>
						</div>

						<div className="flex items-center gap-4 text-muted-foreground text-sm">
							<div className="flex items-center gap-1">
								<span className="font-medium">
									{formatNumber(table.total_rows)}
								</span>
								<span>rows</span>
							</div>
							<div className="flex items-center gap-1">
								<span className="font-medium">
									{formatBytes(table.total_bytes)}
								</span>
							</div>
						</div>

						{/* Health indicator */}
						<div className="flex items-center gap-2">
							<div
								className={`h-2 w-2 rounded-full ${table.total_rows > 0 ? 'bg-green-500' : 'bg-gray-400'}`}
							/>
							<span className="text-muted-foreground text-xs">
								{table.total_rows > 0 ? 'Active' : 'Empty'}
							</span>
						</div>
					</div>

					<div className="ml-4 flex items-center gap-1">
						<Button
							disabled={loading}
							onClick={() => onViewData(fullTableName)}
							size="sm"
							title="View table data"
							variant="ghost"
						>
							<Eye className="h-4 w-4" />
						</Button>

						{onAnalyze && (
							<Button
								disabled={loading}
								onClick={() => onAnalyze(fullTableName)}
								size="sm"
								title="Analyze table"
								variant="ghost"
							>
								<BarChart3 className="h-4 w-4" />
							</Button>
						)}

						{onExportData && (
							<Button
								disabled={loading}
								onClick={() => onExportData(fullTableName)}
								size="sm"
								title="Export data"
								variant="ghost"
							>
								<Download className="h-4 w-4" />
							</Button>
						)}

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									disabled={loading}
									size="sm"
									title="Drop table"
									variant="ghost"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Drop Table</AlertDialogTitle>
									<AlertDialogDescription>
										Are you sure you want to drop table{' '}
										<strong>{fullTableName}</strong>? This will permanently
										delete all {formatNumber(table.total_rows)} rows and cannot
										be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
										onClick={() => onDropTable(fullTableName)}
									>
										Drop Table
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
