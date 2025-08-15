import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { PercentageBadge } from '@/app/(main)/websites/[id]/_components/utils/technology-helpers';

// Generic data item that all tab data should extend
export interface BaseTabItem {
	visitors: number;
	pageviews?: number;
	visits?: number;
	percentage?: number;
	[key: string]: any;
}

// Configuration for a single tab
export interface TabConfig<T extends BaseTabItem> {
	id: string;
	label: string;
	data: T[];
	primaryField: keyof T;
	primaryHeader: string;
	customCell?: (info: CellContext<T, unknown>) => React.ReactNode;
	getFilter?: (row: T) => { field: string; value: string };
}

// Generic function to add percentages to data
export function addPercentages<T extends BaseTabItem>(data: T[]): T[] {
	if (!data?.length) {
		return [];
	}

	const totalVisitors = data.reduce(
		(sum: number, item: T) => sum + (item.visitors || 0),
		0
	);

	return data.map((item: T) => ({
		...item,
		percentage:
			totalVisitors > 0 ? Math.round((item.visitors / totalVisitors) * 100) : 0,
	}));
}

// Utility for compact number formatting
const formatNumber = (value: number | null | undefined): string => {
	if (value == null || Number.isNaN(value)) {
		return '0';
	}
	return Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 1,
	}).format(value);
};

// Generic function to create columns for any tab data
export function createTabColumns<T extends BaseTabItem>(
	primaryField: string,
	primaryHeader: string,
	customCell?: (info: CellContext<T, unknown>) => React.ReactNode
): ColumnDef<T, unknown>[] {
	return [
		{
			accessorKey: primaryField,
			header: primaryHeader,
			cell:
				customCell ||
				((info: CellContext<T, unknown>) => {
					const value = info.getValue() as string;
					return <span className="font-medium">{value || 'Unknown'}</span>;
				}),
		},
		{
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: (info: CellContext<T, unknown>) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			accessorKey: 'pageviews',
			header: 'Views',
			cell: (info: CellContext<T, unknown>) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			accessorKey: 'percentage',
			header: 'Share',
			cell: (info: CellContext<T, unknown>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}

// Simplified type for tab configuration
export interface SimpleTabConfig<T extends BaseTabItem> {
	data: T[];
	label: string;
	primaryField: string;
	primaryHeader: string;
	customCell?: (info: CellContext<T, unknown>) => React.ReactNode;
	getFilter?: (row: T) => { field: string; value: string };
}

// Hook to create tabs from simple data configuration
export function useTableTabs(tabsData: Record<string, SimpleTabConfig<any>>) {
	return useMemo(() => {
		return Object.entries(tabsData).map(([id, config]) => ({
			id,
			label: config.label,
			data: addPercentages(config.data || []),
			columns: createTabColumns(
				config.primaryField,
				config.primaryHeader,
				config.customCell
			),
			getFilter: config.getFilter,
		}));
	}, [tabsData]);
}
