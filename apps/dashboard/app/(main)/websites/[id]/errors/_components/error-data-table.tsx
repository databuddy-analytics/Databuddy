"use client";

import type { ErrorTab } from "@databuddy/shared/types/errors";
import dynamic from "next/dynamic";
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
		loading: () => <div className="h-96 animate-pulse rounded bg-muted/20" />,
	}
);

interface ErrorDataTableProps {
	processedData: {
		error_types: ErrorType[];
		errors_by_page: ErrorByPage[];
	};
	isLoading: boolean;
	isRefreshing: boolean;
}

export const ErrorDataTable = ({
	processedData,
	isLoading,
	isRefreshing,
}: ErrorDataTableProps) => {
	const errorTabs: ErrorTab[] = [
		{
			id: "error_types",
			label: "Error Types",
			data: processedData.error_types,
			columns: createErrorTypeColumns(),
		},
		{
			id: "errors_by_page",
			label: "By Page",
			data: processedData.errors_by_page,
			columns: [createPageColumn(), ...errorColumns],
		},
	];

	return (
		<DataTable
			description="Comprehensive error breakdown across different dimensions"
			initialPageSize={15}
			isLoading={isLoading || isRefreshing}
			minHeight={400}
			tabs={errorTabs}
			title="Error Analysis"
		/>
	);
};
