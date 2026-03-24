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

export interface TabConfig<TData> {
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
	/** Native title on Share column; omit for default visitor-share explanation; pass "" to hide. */
	shareColumnTooltip?: string;
}

const SKELETON_ROW_WIDTHS = ["60%", "45%", "55%", "35%", "50%"] as const;

const TableSkeleton = ({ minHeight }: { minHeight: string | number }) => (
	<div className="bg-accent" style={{ height: minHeight }}>
		<div className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b bg-card px-2">
			<Skeleton className="h-3 w-20 rounded" />
			<div className="flex-1" />
			<Skeleton className="h-3 w-14 rounded" />
			<Skeleton className="h-3 w-10 rounded" />
		</div>
		{SKELETON_ROW_WIDTHS.map((width, i) => (
			<div
				className="flex h-11 items-center gap-3 border-b px-2"
				key={`skeleton-row-${i}`}
			>
				<Skeleton className="h-3.5 rounded" style={{ width }} />
				<div className="flex-1" />
				<Skeleton className="h-3.5 w-10 rounded" />
			</div>
		))}
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
	shareColumnTooltip,
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
					"w-full overflow-hidden rounded border bg-card backdrop-blur-sm",
					className
				)}
			>
				<TableToolbar
					borderBottom={!tabs}
					description={description}
					showFullScreen={false}
					title={title}
				/>
				{tabs && tabs.length > 1 && (
					<div className="mt-3">
						<div className="flex gap-1 border-b">
							{tabs.map((tab) => (
								<Skeleton
									className="h-9 w-20 rounded-none border-transparent border-b-2"
									key={tab.id}
								/>
							))}
						</div>
					</div>
				)}
				<div className="overflow-hidden">
					<TableSkeleton minHeight={minHeight} />
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
						shareColumnTooltip={shareColumnTooltip}
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
						className="fixed inset-0 z-50 flex items-center justify-center"
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
								shareColumnTooltip={shareColumnTooltip}
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
