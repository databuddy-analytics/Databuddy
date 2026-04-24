import type { QueryBuilderMeta } from "@databuddy/shared/types/query";
import { useQuery } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface QueryTypesResponse {
	configs: Record<
		string,
		{
			allowedFilters: string[];
			customizable?: boolean;
			defaultLimit?: number;
			meta?: QueryBuilderMeta;
		}
	>;
	success: boolean;
	types: string[];
}

export interface QueryTypeOption {
	category: string;
	defaultVisualization: QueryBuilderMeta["default_visualization"];
	description: string;
	key: string;
	outputFields: NonNullable<QueryBuilderMeta["output_fields"]>;
	supportsGranularity: QueryBuilderMeta["supports_granularity"];
	title: string;
}

async function fetchQueryTypes(): Promise<QueryTypeOption[]> {
	const response = await fetch(
		`${API_BASE_URL}/v1/query/types?include_meta=true`,
		{
			credentials: "include",
		}
	);

	if (!response.ok) {
		throw new Error("Failed to fetch query types");
	}

	const data: QueryTypesResponse = await response.json();

	if (!data.success) {
		throw new Error("Failed to fetch query types");
	}

	const options: QueryTypeOption[] = [];

	for (const key of data.types) {
		const config = data.configs[key];
		const meta = config?.meta;

		if (meta) {
			options.push({
				key,
				title: meta.title,
				description: meta.description,
				category: meta.category || "Other",
				outputFields: meta.output_fields || [],
				defaultVisualization: meta.default_visualization,
				supportsGranularity: meta.supports_granularity,
			});
		}
	}

	return options;
}

export function useQueryTypes() {
	const query = useQuery({
		queryKey: ["query-types"],
		queryFn: fetchQueryTypes,
		staleTime: 10 * 60 * 1000,
		gcTime: 30 * 60 * 1000,
	});

	const groupedByCategory = query.data?.reduce(
		(acc, option) => {
			const category = option.category;
			if (!acc[category]) {
				acc[category] = [];
			}
			acc[category].push(option);
			return acc;
		},
		{} as Record<string, QueryTypeOption[]>
	);

	/** Get query types filtered by visualization type */
	const getByVisualization = (
		viz: QueryBuilderMeta["default_visualization"]
	): QueryTypeOption[] =>
		(query.data || []).filter((t) => t.defaultVisualization === viz);

	/** Get query types filtered by category */
	const getByCategory = (category: string): QueryTypeOption[] =>
		(query.data || []).filter((t) => t.category === category);

	/** Find a query type by key */
	const getByKey = (key: string): QueryTypeOption | undefined =>
		(query.data || []).find((t) => t.key === key);

	return {
		queryTypes: query.data || [],
		groupedByCategory: groupedByCategory || {},
		isLoading: query.isLoading,
		isError: query.isError,
		error: query.error,
		getByVisualization,
		getByCategory,
		getByKey,
	};
}
