import { XIcon } from "@phosphor-icons/react";
import {
	type ColumnDef,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { SectionBrandOverlay } from "@/components/logo/section-brand-overlay";
import { TableContent } from "./table-content";
import { TableTabs } from "./table-tabs";

interface TabConfig<TData> {
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	getFilter?: (row: TData) => { field: string; value: string };
	id: string;
	label: string;
}

interface FullScreenModalProps<TData extends { name: string | number }> {
	activeTab?: string;
	columns?: ColumnDef<TData, unknown>[];
	data?: TData[];
	description?: string;
	expandable?: boolean;
	getSubRows?: (row: TData) => TData[] | undefined;
	onAddFilter?: (field: string, value: string, tableTitle?: string) => void;
	onClose: () => void;
	onRowAction?: (row: TData) => void;
	onRowClick?: (field: string, value: string | number) => void;
	onTabChange?: (tabId: string) => void;
	renderSubRow?: (
		subRow: TData,
		parentRow: TData,
		index: number
	) => React.ReactNode;
	shareColumnTooltip?: string;
	showBrand?: boolean;
	tabs?: TabConfig<TData>[];
	title?: string;
}

export function FullScreenModal<TData extends { name: string | number }>({
	data,
	columns,
	title,
	description,
	onClose,
	tabs,
	activeTab,
	onTabChange,
	expandable = false,
	getSubRows,
	renderSubRow,
	onAddFilter,
	onRowAction,
	onRowClick,
	shareColumnTooltip,
	showBrand = false,
}: FullScreenModalProps<TData>) {
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
		onTabChange?.(tabId);
	};
	return (
		<div className="relative flex h-full w-full flex-col bg-sidebar">
			<div className="flex items-start justify-between gap-3 border-sidebar-border border-b bg-sidebar px-3 pt-3 pb-2 sm:items-center">
				<div className="min-w-0 flex-1">
					{title && (
						<h3 className="truncate font-semibold text-sidebar-foreground text-sm">
							{title}
						</h3>
					)}
					{description && (
						<p className="mt-0.5 line-clamp-2 text-pretty text-sidebar-foreground/70 text-xs">
							{description}
						</p>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{showBrand ? <SectionBrandOverlay layout="inline" /> : null}
					<button
						aria-label="Close full screen"
						className="flex items-center justify-center rounded bg-sidebar-accent/60 p-2 text-sidebar-foreground hover:bg-sidebar-accent"
						onClick={onClose}
						style={{ minWidth: 40, minHeight: 40 }}
						tabIndex={0}
						title="Close"
						type="button"
					>
						<XIcon size={20} />
					</button>
				</div>
			</div>

			{tabs && tabs.length > 1 && (
				<div className="mt-2">
					<TableTabs
						activeTab={activeTab ?? ""}
						onTabChange={handleTabChange}
						tabs={tabs}
					/>
				</div>
			)}

			<div className="flex-1 overflow-auto px-3 pb-3">
				<TableContent
					activeTab={activeTab}
					expandable={expandable}
					getSubRows={getSubRows}
					minHeight="100%"
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
	);
}
