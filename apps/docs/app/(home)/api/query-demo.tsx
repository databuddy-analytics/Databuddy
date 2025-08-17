'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getQueryTypes } from './actions';
import { executeBatchQueries } from './query-builder';
import { QueryResults } from './query-results';
import { QueryTypeSelector } from './query-type-selector';
import type { BatchQueryResponse, DynamicQueryRequest } from './types';

interface QueryType {
	name: string;
	defaultLimit?: number;
	customizable?: boolean;
	allowedFilters?: string[];
}

export function QueryDemo() {
	const [availableTypes, setAvailableTypes] = useState<QueryType[]>([]);
	const [selectedOrder, setSelectedOrder] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [result, setResult] = useState<BatchQueryResponse | null>(null);

	const selectedTypes = useMemo(() => new Set(selectedOrder), [selectedOrder]);

	const runQueries = useCallback(async (parameters: string[]) => {
		if (parameters.length === 0) {
			return;
		}

		setIsLoading(true);
		setResult(null);

		try {
			const queries: DynamicQueryRequest[] = [
				{
					id: 'custom-query',
					parameters,
					limit: 50,
				},
			];

			const websiteId = 'OXmNQsViBT-FOS_wZCTHc';
			const endDate = new Date().toISOString().split('T')[0];
			const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
				.toISOString()
				.split('T')[0];

			const response = await executeBatchQueries(
				websiteId,
				startDate,
				endDate,
				queries
			);

			setResult(response);
		} catch {
			setResult({
				success: false,
				batch: true,
				results: [
					{
						success: false,
						queryId: 'custom-query',
						data: [],
						meta: {
							parameters,
							total_parameters: parameters.length,
							page: 1,
							limit: 50,
							filters_applied: 0,
						},
					},
				],
			});
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		const loadTypes = async () => {
			const data = await getQueryTypes();
			if (data.success) {
				const types = data.types.map((name) => ({
					name,
					defaultLimit: data.configs[name]?.defaultLimit,
					customizable: data.configs[name]?.customizable,
					allowedFilters: data.configs[name]?.allowedFilters,
				}));
				setAvailableTypes(types);

				const sortedByUtility = [...types].sort((a, b) => {
					const aScore =
						(a.customizable ? 1 : 0) * 2 + (a.allowedFilters?.length || 0);
					const bScore =
						(b.customizable ? 1 : 0) * 2 + (b.allowedFilters?.length || 0);
					return bScore - aScore;
				});
				const defaultSelectedNames = sortedByUtility
					.slice(0, Math.min(3, sortedByUtility.length))
					.map((t) => t.name);
				if (defaultSelectedNames.length > 0) {
					setSelectedOrder(defaultSelectedNames);
					runQueries(defaultSelectedNames);
				}
			}
		};
		loadTypes();
	}, [runQueries]);

	const handleTypeToggle = (typeName: string) => {
		setSelectedOrder((prev) => {
			if (prev.includes(typeName)) {
				return prev.filter((n) => n !== typeName);
			}
			return [...prev, typeName];
		});
	};

	const handleClearSelection = () => {
		setSelectedOrder([]);
	};

	const handleExecuteQuery = async () => {
		if (selectedOrder.length === 0) {
			return;
		}

		await runQueries(selectedOrder);
	};

	return (
		<div className="w-full p-4 sm:p-6">
			<div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
				<QueryTypeSelector
					availableTypes={availableTypes}
					isLoading={isLoading}
					onClearSelection={handleClearSelection}
					onExecuteQuery={handleExecuteQuery}
					onTypeToggle={handleTypeToggle}
					selectedTypes={selectedTypes}
				/>

				<QueryResults isLoading={isLoading} result={result} />
			</div>
		</div>
	);
}
