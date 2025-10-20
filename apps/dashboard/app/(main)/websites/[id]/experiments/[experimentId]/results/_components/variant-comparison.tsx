'use client';

import { DataTable } from '@/components/table/data-table';

interface VariantData {
	variant: string;
	visitors: number;
	conversions: number;
	conversionRate: string;
	revenue: string;
	revenuePerVisitor: string;
}

export function VariantComparison() {
	// Mock variant data
	const variants: VariantData[] = [
		{
			variant: 'Control (Original)',
			visitors: 5234,
			conversions: 581,
			conversionRate: '11.1%',
			revenue: '$12,450',
			revenuePerVisitor: '$2.38',
		},
		{
			variant: 'Variant A (New CTA)',
			visitors: 5189,
			conversions: 644,
			conversionRate: '12.4%',
			revenue: '$14,230',
			revenuePerVisitor: '$2.74',
		},
	];

	const formatNumber = (value: number): string => {
		return Intl.NumberFormat(undefined, {
			notation: 'compact',
			maximumFractionDigits: 1,
		}).format(value);
	};

	const columns = [
		{
			id: 'variant',
			accessorKey: 'variant',
			header: 'Variant',
			cell: (info: any) => (
				<span className="font-medium text-foreground">{info.getValue()}</span>
			),
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: (info: any) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: 'conversions',
			accessorKey: 'conversions',
			header: 'Conversions',
			cell: (info: any) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: 'conversionRate',
			accessorKey: 'conversionRate',
			header: 'Conversion Rate',
			cell: (info: any) => (
				<span className="font-medium text-foreground">{info.getValue()}</span>
			),
		},
		{
			id: 'revenue',
			accessorKey: 'revenue',
			header: 'Revenue',
			cell: (info: any) => (
				<span className="font-medium text-muted-foreground">
					{info.getValue()}
				</span>
			),
		},
		{
			id: 'revenuePerVisitor',
			accessorKey: 'revenuePerVisitor',
			header: 'Revenue/Visitor',
			cell: (info: any) => (
				<span className="font-medium text-muted-foreground">
					{info.getValue()}
				</span>
			),
		},
	];

	return (
		<DataTable
			columns={columns}
			data={variants}
			description="Performance comparison between control and variants"
			emptyMessage="No variant data available"
			initialPageSize={8}
			isLoading={false}
			minHeight={200}
			showSearch={false}
			title="Variant Performance"
		/>
	);
}
