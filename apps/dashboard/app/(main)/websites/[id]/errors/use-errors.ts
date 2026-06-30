import type { DateRange } from "@/types/analytics";
import type { BatchQueryResponse, DynamicQueryFilter } from "@/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";

export function useEnhancedErrorData(
	websiteId: string,
	dateRange: DateRange,
	options?: Partial<UseQueryOptions<BatchQueryResponse>> & {
		filters?: DynamicQueryFilter[];
	}
) {
	const filters = options?.filters || [];

	return useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{ id: "recent_errors", parameters: ["recent_errors"], filters },
			{ id: "error_types", parameters: ["error_types"], filters },
			{ id: "errors_by_page", parameters: ["errors_by_page"], filters },
			{ id: "error_summary", parameters: ["error_summary"], filters },
			{ id: "error_chart_data", parameters: ["error_chart_data"], filters },
		],
		options
	);
}
