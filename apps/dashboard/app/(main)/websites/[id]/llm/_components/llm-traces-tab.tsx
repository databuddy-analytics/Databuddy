"use client";

import type { DateRange } from "@databuddy/shared/types/analytics";
import type { DynamicQueryRequest } from "@databuddy/shared/types/api";
import { useMemo } from "react";
import { DataTable } from "@/components/table/data-table";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import {
	createRecentCallColumns,
	createToolNameColumns,
	createTraceColumns,
	type LlmRecentCallRow,
	type LlmToolNameRow,
	type LlmTraceSummaryRow,
} from "./llm-columns";

interface LlmTracesTabProps {
	dateRange: DateRange;
	websiteId: string;
}

export function LlmTracesTab({ websiteId, dateRange }: LlmTracesTabProps) {
	const queries: DynamicQueryRequest[] = [
		{ id: "llm-traces", parameters: ["llm_trace_summary"] },
		{ id: "llm-tool-names", parameters: ["llm_tool_name_breakdown"] },
		{ id: "llm-recent-calls", parameters: ["llm_recent_calls"] },
	];

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const traceSummary =
		(getDataForQuery(
			"llm-traces",
			"llm_trace_summary"
		) as LlmTraceSummaryRow[]) ?? [];

	const toolNames =
		(getDataForQuery(
			"llm-tool-names",
			"llm_tool_name_breakdown"
		) as LlmToolNameRow[]) ?? [];

	const recentCalls =
		(
			getDataForQuery(
				"llm-recent-calls",
				"llm_recent_calls"
			) as LlmRecentCallRow[]
		)?.map((row) => ({
			...row,
			name: row.trace_id ?? row.model,
		})) ?? [];

	const traceRows = useMemo(
		() =>
			traceSummary.map((row) => ({
				...row,
				name: row.trace_id,
			})),
		[traceSummary]
	);

	return (
		<div className="space-y-4">
			<DataTable
				columns={createTraceColumns()}
				data={traceRows}
				description="Trace-level aggregates"
				isLoading={isLoading}
				title="Trace Summary"
			/>

			{toolNames.length > 0 && (
				<DataTable
					columns={createToolNameColumns()}
					data={toolNames}
					description="Top tools used across calls"
					isLoading={isLoading}
					title="Tool Names"
				/>
			)}

			<DataTable
				columns={createRecentCallColumns()}
				data={recentCalls}
				description="Recent calls across traces"
				isLoading={isLoading}
				title="Recent Calls"
			/>
		</div>
	);
}
