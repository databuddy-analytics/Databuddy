import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { PercentageBadge } from "@/app/(main)/websites/[id]/_components/utils/technology-helpers";
import { formatNumber } from "@/lib/formatters";

export interface BaseTabItem {
	pageviews?: number;
	percentage?: number;
	visitors: number;
	visits?: number;
	[key: string]: any;
}

export interface TabConfig<T extends BaseTabItem> {
	customCell?: (info: CellContext<T, unknown>) => React.ReactNode;
	data: T[];
	getFilter?: (row: T) => { field: string; value: string };
	id: string;
	label: string;
	primaryField: keyof T;
	primaryHeader: string;
}

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
					return <span className="font-medium">{value || "Unknown"}</span>;
				}),
		},
		{
			accessorKey: "visitors",
			header: "Visitors",
			cell: (info: CellContext<T, unknown>) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			accessorKey: "pageviews",
			header: "Views",
			cell: (info: CellContext<T, unknown>) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			accessorKey: "percentage",
			header: "Share",
			cell: (info: CellContext<T, unknown>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}

export interface SimpleTabConfig<T extends BaseTabItem> {
	customCell?: (info: CellContext<T, unknown>) => React.ReactNode;
	data: T[];
	getFilter?: (row: T) => { field: string; value: string };
	label: string;
	primaryField: string;
	primaryHeader: string;
}

export function useTableTabs(tabsData: Record<string, SimpleTabConfig<any>>) {
	return useMemo(
		() =>
			Object.entries(tabsData).map(([id, config]) => ({
				id,
				label: config.label,
				data: addPercentages(config.data || []),
				columns: createTabColumns(
					config.primaryField,
					config.primaryHeader,
					config.customCell
				),
				getFilter: config.getFilter,
			})),
		[tabsData]
	);
}
