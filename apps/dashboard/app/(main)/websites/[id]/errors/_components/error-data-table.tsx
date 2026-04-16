"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	createErrorTypeColumns,
	createPageColumn,
	errorColumns,
} from "./error-table-columns";
import type { ErrorByPage, ErrorType } from "./types";

const DataTable = dynamic(
	() =>
		import("@/components/table/data-table").then((mod) => ({
			default: mod.DataTable,
		})),
	{
		ssr: false,
		loading: () => (
			<div className="rounded border bg-sidebar">
				<div className="border-b px-3 py-2.5 sm:px-4 sm:py-3">
					<Skeleton className="h-5 w-24" />
				</div>
				<div className="p-3 sm:p-4">
					<Skeleton className="h-64 w-full" />
				</div>
			</div>
		),
	}
);

interface ErrorDataTableProps {
	isLoading: boolean;
	isRefreshing: boolean;
	onAddFilter?: (field: string, value: string) => void;
	processedData: {
		error_types: ErrorType[];
		errors_by_page: ErrorByPage[];
	};
}

export const ErrorDataTable = ({
	processedData,
	isLoading,
	isRefreshing,
	onAddFilter,
}: ErrorDataTableProps) => {
	const errorTabs = useMemo(
		() => [
			{
				id: "error_types",
				label: "Error Types",
				data: processedData.error_types,
				columns: createErrorTypeColumns(),
				getFilter: (row: ErrorType) => ({
					field: "message",
					value: row.name,
				}),
			},
			{
				id: "errors_by_page",
				label: "By Page",
				data: processedData.errors_by_page,
				columns: [createPageColumn(), ...errorColumns],
				getFilter: (row: ErrorByPage) => ({
					field: "path",
					value: row.name,
				}),
			},
		],
		[processedData.error_types, processedData.errors_by_page]
	);

	return (
		<DataTable
			description="Error breakdown by type and page"
			initialPageSize={15}
			isLoading={isLoading || isRefreshing}
			minHeight={350}
			onAddFilter={onAddFilter}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			tabs={errorTabs as any}
			title="Error Analysis"
		/>
	);
};
