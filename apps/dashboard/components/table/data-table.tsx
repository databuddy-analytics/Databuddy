import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import type React from "react";
import { useState } from "react";
import ReactDOM from "react-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FullScreenModal } from "./fullscreen-modal";
import { useFullScreen } from "./hooks/use-fullscreen";
import { TableContent } from "./table-content";
import { TableTabs } from "./table-tabs";
import { TableToolbar } from "./table-toolbar";

const DEFAULT_MIN_HEIGHT = 200;
const FULLSCREEN_HEIGHT = "h-[92vh]";
const FULLSCREEN_WIDTH = "w-[92vw]";

export type TabConfig<TData> = {
	id: string;
	label: string;
	data: TData[];
	columns: ColumnDef<TData, unknown>[];
	getFilter?: (row: TData) => { field: string; value: string };
};

type DataTableProps<TData extends { name: string | number }, TValue> = {
	data?: TData[] | undefined;
	columns?: ColumnDef<TData, TValue>[];
	tabs?: TabConfig<TData>[];
	title: string;
	description?: string;
	isLoading?: boolean;
	initialPageSize?: number;
	emptyMessage?: string;
	className?: string;
	onRowClick?: (field: string, value: string | number) => void;
	onAddFilter?: (field: string, value: string, tableTitle?: string) => void;
	onRowAction?: (row: TData) => void;
	minHeight?: string | number;
	getSubRows?: (row: TData) => TData[] | undefined;
	renderSubRow?: (
		subRow: TData,
		parentRow: TData,
		index: number
	) => React.ReactNode;
	expandable?: boolean;
};

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
					<Skeleton className="size-6 shrink-0 rounded-full" />
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

export function DataTable<TData extends { name: string | number }, TValue>({
	data,
	columns,
	tabs,
	title,
	description,
	isLoading = false,
	emptyMessage = "No data available",
	className,
	onRowClick,
	minHeight = DEFAULT_MIN_HEIGHT,
	getSubRows,
	renderSubRow,
	expandable = false,
	onAddFilter,
	onRowAction,
}: DataTableProps<TData, TValue>) {
	const [activeTab, setActiveTab] = useState(tabs?.[0]?.id || "");

	const { fullScreen, setFullScreen, hasMounted, modalRef } = useFullScreen();

	const currentTabData = tabs?.find((tab) => tab.id === activeTab);
	const tableData = currentTabData?.data || data || [];
	const tableColumns = currentTabData?.columns || columns || [];

	const table = useReactTable({
		data: tableData,
		columns: tableColumns,
		getRowId: (_row, index) => `${activeTab || "row"}-${index}`,
		getCoreRowModel: getCoreRowModel(),
	});

	const handleTabChange = (tabId: string) => {
		if (tabId === activeTab) {
			return;
		}
		setActiveTab(tabId);
	};

	if (isLoading) {
		return (
			<div
				className={cn(
					"w-full overflow-hidden rounded border bg-accent/50 backdrop-blur-sm",
					className
				)}
			>
				<div className="p-4 px-2 pb-2 sm:px-3">
					<div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
						<div className="min-w-0 flex-1">
							<Skeleton className="h-5 w-32 rounded" />
							{description && <Skeleton className="mt-0.5 h-3 w-48 rounded" />}
						</div>
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

	return (
		<>
			<div
				className={cn(
					"w-full overflow-hidden rounded border bg-card backdrop-blur-sm",
					className
				)}
			>
				{/* Toolbar */}
				<TableToolbar
					borderBottom={!tabs}
					description={description}
					onFullScreenToggle={() => setFullScreen(true)}
					title={title}
				/>

				{/* Tabs */}
				{tabs && (
					<TableTabs
						activeTab={activeTab}
						onTabChange={handleTabChange}
						tabs={tabs}
					/>
				)}

				{/* Remove borders to prevent double borders. Card already has borders on the left and bottom. */}
				<div className="overflow-hidden [&_tr:last-child]:border-b-0 [&_tr]:border-l-0">
					<TableContent
						activeTab={activeTab}
						emptyMessage={emptyMessage}
						expandable={expandable}
						getSubRows={getSubRows}
						minHeight={minHeight}
						onAddFilter={onAddFilter}
						onRowAction={onRowAction}
						onRowClick={onRowClick}
						renderSubRow={renderSubRow}
						table={table}
						tabs={tabs}
						title={title}
					/>
				</div>
			</div>

			{hasMounted &&
				fullScreen &&
				ReactDOM.createPortal(
					<div
						className="fixed inset-0 z-1000 flex items-center justify-center"
						ref={modalRef}
						tabIndex={-1}
					>
						<div className="absolute inset-0 animate-fadein bg-black/70 backdrop-blur-[3px] transition-opacity" />
						<div
							className={cn(
								"relative flex scale-100 animate-scalein flex-col overflow-hidden rounded border border-border bg-background shadow-2xl",
								FULLSCREEN_HEIGHT,
								FULLSCREEN_WIDTH
							)}
						>
							<FullScreenModal
								activeTab={activeTab}
								columns={tableColumns as ColumnDef<TData, unknown>[]}
								data={tableData}
								description={description}
								expandable={expandable}
								getSubRows={getSubRows}
								onAddFilter={onAddFilter}
								onClose={() => setFullScreen(false)}
								onRowAction={onRowAction}
								onRowClick={onRowClick}
								onTabChange={handleTabChange}
								renderSubRow={renderSubRow}
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
