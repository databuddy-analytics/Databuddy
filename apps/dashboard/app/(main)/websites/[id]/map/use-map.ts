import type { DateRange } from"@databuddy/shared/types/analytics";
import type {
	BatchQueryResponse,
	DynamicQueryFilter,
} from"@databuddy/shared/types/api";
import type { UseQueryOptions } from"@tanstack/react-query";
import { useBatchDynamicQuery } from"@/hooks/use-dynamic-query";

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
				id:"map-countries",
				parameters: ["country"],
				limit: 100,
				filters,
			},
			{
				id:"map-regions",
				parameters: ["region"],
				limit: 100,
				filters,
			},
		],
		options
	);
}
