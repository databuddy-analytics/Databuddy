"use client";

import { useMemo } from "react";
import { DataTable } from "@/components/table/data-table";
import {
	createErrorTypeColumns,
	createPageColumn,
	errorColumns,
} from "./error-table-columns";
import type { ErrorByPage, ErrorType } from "./types";

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
			tabs={errorTabs as any}
			title="Error Analysis"
		/>
	);
};
