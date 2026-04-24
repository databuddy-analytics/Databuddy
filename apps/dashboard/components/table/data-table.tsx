import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import type React from "react";
import { useState } from "react";
import ReactDOM from "react-dom";
import { Card } from "@/components/ds/card";
import { Skeleton } from "@/components/ds/skeleton";
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
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	getFilter?: (row: TData) => { field: string; value: string };
	id: string;
	label: string;
}

interface DataTableProps<TData extends { name: string | number }, TValue> {
	className?: string;
	columns?: ColumnDef<TData, TValue>[];
	data?: TData[] | undefined;
	description?: string;
	emptyMessage?: string;
	expandable?: boolean;
	getSubRows?: (row: TData) => TData[] | undefined;
	initialPageSize?: number;
	isLoading?: boolean;
	minHeight?: string | number;
	onAddFilter?: (field: string, value: string, tableTitle?: string) => void;
	onRowAction?: (row: TData) => void;
	onRowClick?: (field: string, value: string | number) => void;
	renderSubRow?: (
		subRow: TData,
		parentRow: TData,
		index: number
	) => React.ReactNode;
	shareColumnTooltip?: string;
	showBrandInHeader?: boolean;
	tabs?: TabConfig<TData>[];
	title: string;
}

const SKELETON_ROW_WIDTHS = ["60%", "45%", "55%", "35%", "50%"] as const;

function TableSkeleton({ minHeight }: { minHeight: string | number }) {
	return (
		<div style={{ height: minHeight }}>
			<div className="flex h-10 items-center gap-2 border-b px-5">
				<Skeleton className="h-3 w-20 rounded" />
				<div className="flex-1" />
				<Skeleton className="h-3 w-14 rounded" />
				<Skeleton className="h-3 w-10 rounded" />
			</div>
			{SKELETON_ROW_WIDTHS.map((width, i) => (
				<div
					className="flex items-center gap-3 border-border/80 border-b px-5 py-3 last:border-b-0"
					key={`skeleton-row-${i}`}
				>
					<Skeleton className="h-3.5 rounded" style={{ width }} />
					<div className="flex-1" />
					<Skeleton className="h-3.5 w-10 rounded" />
				</div>
			))}
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
	showBrandInHeader = false,
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
			<Card className={className}>
				<TableToolbar
					description={description}
					showBrand={showBrandInHeader}
					showFullScreen={false}
					title={title}
				/>
				{tabs && tabs.length > 1 && (
					<div className="flex gap-1 border-b px-2">
						{tabs.map((tab) => (
							<Skeleton className="my-1 h-8 w-20 rounded" key={tab.id} />
						))}
					</div>
				)}
				<TableSkeleton minHeight={minHeight} />
			</Card>
		);
	}

	return (
		<>
			<Card className={className}>
				<TableToolbar
					description={description}
					onFullScreenToggle={() => setFullScreen(true)}
					showBrand={showBrandInHeader}
					title={title}
				/>

				{tabs && (
					<TableTabs
						activeTab={activeTab}
						onTabChange={handleTabChange}
						tabs={tabs}
					/>
				)}

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
			</Card>

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
								"relative flex scale-100 animate-scalein flex-col overflow-hidden rounded-lg border border-border/60 bg-card shadow-2xl",
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
								showBrand={showBrandInHeader}
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
