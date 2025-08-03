'use client';

import {
	ChevronDown,
	Database,
	Download,
	MoreHorizontal,
	RefreshCw,
	Settings,
	TableIcon,
	Trash2,
} from 'lucide-react';
import Link from 'next/link';
import React from 'react';
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
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

interface TableStats {
	total_rows: number;
	total_bytes: number;
	compressed_size: string;
	uncompressed_size: string;
}

interface TableTopbarProps {
	database: string;
	table: string;
	stats: TableStats | null;
	columnsCount: number;
	loading: boolean;
	onRefresh: () => void;
	onExport: () => void;
	onDropTable: () => void;
}

export function TableTopbar({
	database,
	table,
	stats,
	columnsCount,
	loading,
	onRefresh,
	onExport,
	onDropTable,
}: TableTopbarProps) {
	const [confirmText, setConfirmText] = React.useState('');
	const formatNumber = (num: number) => {
		return new Intl.NumberFormat().format(num);
	};

	return (
		<div className="flex h-16 w-full items-center border-border border-b bg-sidebar px-4">
			<div className="flex flex-1 items-center gap-4">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink className="flex items-center gap-2" href="/">
								<Database className="h-4 w-4" />
								Database
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<DropdownMenu>
								<DropdownMenuTrigger className="flex cursor-pointer select-none items-center gap-1 outline-none transition-all duration-150 hover:text-foreground">
									{database}
									<ChevronDown className="h-3 w-3" />
								</DropdownMenuTrigger>
								<DropdownMenuContent align="start">
									<DropdownMenuItem asChild>
										<Link href="/">Browse all databases</Link>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage className="flex items-center gap-2">
								<TableIcon className="h-4 w-4" />
								{table}
							</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</div>

			{/* Stats in header */}
			<div className="flex items-center gap-6 text-muted-foreground text-sm">
				{stats && (
					<>
						<div className="flex items-center gap-2">
							<span>{formatNumber(stats.total_rows)} rows</span>
						</div>
						<div className="flex items-center gap-2">
							<span>{stats.compressed_size}</span>
						</div>
						<div className="flex items-center gap-2">
							<span>{columnsCount} columns</span>
						</div>
					</>
				)}
			</div>

			{/* Actions */}
			<div className="ml-6 flex items-center gap-2">
				<Button asChild size="sm" variant="ghost">
					<Link href={`/table/${database}/${table}/schema`}>
						<Settings className="mr-2 h-4 w-4" />
						Schema
					</Link>
				</Button>

				<Button
					disabled={loading}
					onClick={onRefresh}
					size="sm"
					variant="ghost"
				>
					<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" variant="ghost">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem disabled={loading} onClick={onExport}>
							<Download className="mr-2 h-4 w-4" />
							Export CSV
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
									onSelect={(e) => e.preventDefault()}
								>
									<Trash2 className="mr-2 h-4 w-4" />
									Drop Table
								</DropdownMenuItem>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Drop Table</AlertDialogTitle>
									<AlertDialogDescription>
										Are you sure you want to drop table{' '}
										<strong>
											{database}.{table}
										</strong>
										? This action cannot be undone and will permanently delete
										all data.
										<br />
										<br />
										Please type{' '}
										<strong>
											{database}.{table}
										</strong>{' '}
										to confirm.
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
										disabled={confirmText !== `${database}.${table}`}
										onClick={onDropTable}
									>
										Drop Table
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
