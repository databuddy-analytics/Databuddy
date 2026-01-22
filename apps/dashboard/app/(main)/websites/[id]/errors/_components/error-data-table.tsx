"use client";

import type { ErrorTab } from"@databuddy/shared/types/errors";
import dynamic from"next/dynamic";
import { Skeleton } from"@/components/ui/skeleton";
import {
	createErrorTypeColumns,
	createPageColumn,
	errorColumns,
} from"./error-table-columns";
import type { ErrorByPage, ErrorType } from"./types";

const DataTable = dynamic(
	() =>
		import("@/components/table/data-table").then((mod) => ({
			default: mod.DataTable,
		})),
	{
		ssr: false,
		loading: () => (
			<div className=" border bg-sidebar">
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
			id:"error_types",
			label:"Error Types",
			data: processedData.error_types,
			columns: createErrorTypeColumns(),
		},
		{
			id:"errors_by_page",
			label:"By Page",
			data: processedData.errors_by_page,
			columns: [createPageColumn(), ...errorColumns],
		},
	];

	return (
		<DataTable
			description="Error breakdown by type and page"
			initialPageSize={15}
			isLoading={isLoading || isRefreshing}
			minHeight={350}
			tabs={errorTabs}
			title="Error Analysis"
		/>
	);
};
