import type { DateRange } from "@/types/analytics";
import type { BatchQueryResponse, DynamicQueryFilter } from "@/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";

export function useMapLocationData(
	websiteId: string,
	dateRange: DateRange,
	filters?: DynamicQueryFilter[],
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	return useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{
				id: "map-countries",
				parameters: ["country"],
				limit: 200,
				filters,
			},
			{
				id: "map-regions-cities",
				parameters: ["region", "city"],
				limit: 200,
				filters,
			},
		],
		options
	);
}
