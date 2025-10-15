'use client';

import { DataTable } from '@/components/table/data-table';

interface MetricResult {
	metric: string;
	control: string;
	variant: string;
	lift: string;
	confidence: number;
	significant: boolean;
}

// Mock metrics data
const mockMetrics: MetricResult[] = [
	{
		metric: 'Conversion Rate',
		control: '11.1%',
		variant: '12.4%',
		lift: '+11.7%',
		confidence: 95,
		significant: true,
	},
	{
		metric: 'Revenue per Visitor',
		control: '$2.38',
		variant: '$2.72',
		lift: '+14.3%',
		confidence: 92,
		significant: true,
	},
	{
		metric: 'Bounce Rate',
		control: '34.2%',
		variant: '31.8%',
		lift: '-7.0%',
		confidence: 78,
		significant: false,
	},
	{
		metric: 'Time on Page',
		control: '2:34',
		variant: '2:41',
		lift: '+4.6%',
		confidence: 45,
		significant: false,
	},
];

const _formatNumber = (value: number | null | undefined): string => {
	if (value == null || Number.isNaN(value)) {
		return '0';
	}
	return Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 1,
	}).format(value);
};

export function MetricsTable() {
	const columns = [
		{
			id: 'metric',
			accessorKey: 'metric',
			header: 'Metric',
			cell: (info: any) => (
				<span className="font-medium text-foreground">{info.getValue()}</span>
			),
		},
		{
			id: 'control',
			accessorKey: 'control',
			header: 'Control',
			cell: (info: any) => (
				<span className="text-muted-foreground">{info.getValue()}</span>
			),
		},
		{
			id: 'variant',
			accessorKey: 'variant',
			header: 'Variant',
			cell: (info: any) => (
				<span className="text-muted-foreground">{info.getValue()}</span>
			),
		},
		{
			id: 'lift',
			accessorKey: 'lift',
			header: 'Lift',
			cell: (info: any) => {
				const lift = info.getValue() as string;
				return (
					<span
						className={`font-medium ${
							lift.startsWith('+')
								? 'text-foreground'
								: lift.startsWith('-')
									? 'text-muted-foreground'
									: 'text-muted-foreground'
						}`}
					>
						{lift}
					</span>
				);
			},
		},
		{
			id: 'confidence',
			accessorKey: 'confidence',
			header: 'Confidence',
			cell: (info: any) => {
				const confidence = info.getValue() as number;
				const significant = (info.row.original as MetricResult).significant;
				return (
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground text-sm">{confidence}%</span>
						{significant && (
							<span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
								Significant
							</span>
						)}
					</div>
				);
			},
		},
	];

	return (
		<DataTable
			columns={columns}
			data={mockMetrics}
			description="Performance comparison across all tracked metrics"
			emptyMessage="No metrics available"
			initialPageSize={8}
			isLoading={false}
			minHeight={300}
			showSearch={false}
			title="Detailed Metrics"
		/>
	);
}
