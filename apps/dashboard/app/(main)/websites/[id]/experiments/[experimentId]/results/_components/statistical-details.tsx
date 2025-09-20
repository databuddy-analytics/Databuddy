'use client';

import { DataTable } from '@/components/analytics';

interface StatData {
	metric: string;
	value: string;
	description: string;
}

export function StatisticalDetails() {
	// Mock statistical data
	const statisticalData: StatData[] = [
		{
			metric: 'Confidence Level',
			value: '95%',
			description: 'Statistical confidence threshold',
		},
		{
			metric: 'P-value',
			value: '0.03',
			description: 'Probability of Type I error',
		},
		{
			metric: 'Statistical Power',
			value: '85%',
			description: 'Ability to detect true effects',
		},
		{
			metric: 'Z-Score',
			value: '2.24',
			description: 'Standard deviations from null',
		},
		{
			metric: 'Sample Size',
			value: '10,423',
			description: 'Total participants in test',
		},
		{
			metric: 'Effect Size',
			value: '11.7%',
			description: 'Observed treatment effect',
		},
		{
			metric: 'Confidence Interval',
			value: '[2.1%, 22.7%]',
			description: '95% confidence bounds',
		},
		{
			metric: 'Standard Error',
			value: '2.1%',
			description: 'Measurement uncertainty',
		},
	];

	const columns = [
		{
			id: 'metric',
			accessorKey: 'metric',
			header: 'Statistical Measure',
			cell: (info: any) => (
				<span className="font-medium text-foreground">{info.getValue()}</span>
			),
		},
		{
			id: 'value',
			accessorKey: 'value',
			header: 'Value',
			cell: (info: any) => (
				<span className="font-medium text-foreground">{info.getValue()}</span>
			),
		},
		{
			id: 'description',
			accessorKey: 'description',
			header: 'Description',
			cell: (info: any) => (
				<span className="text-muted-foreground text-sm">{info.getValue()}</span>
			),
		},
	];

	return (
		<DataTable
			columns={columns}
			data={statisticalData}
			description="Statistical measures and test parameters"
			emptyMessage="No statistical data available"
			initialPageSize={8}
			isLoading={false}
			minHeight={400}
			showSearch={false}
			title="Statistical Analysis"
		/>
	);
}
