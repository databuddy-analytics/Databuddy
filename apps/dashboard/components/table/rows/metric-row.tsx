import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { PercentageBadge } from '@/components/ui/percentage-badge';

export interface MetricEntry {
	name: string;
	visitors: number;
	pageviews?: number;
	percentage?: number;
}

const formatNumber = (value: number | null | undefined): string => {
	if (value == null || Number.isNaN(value)) {
		return '0';
	}
	return Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 1,
	}).format(value);
};

interface MetricRowProps {
	includeName?: boolean;
	nameLabel?: string;
	includePageviews?: boolean;
	visitorsLabel?: string;
	pageviewsLabel?: string;
	percentageLabel?: string;
}

export function createMetricColumns({
	includeName = false,
	nameLabel = 'Name',
	includePageviews = true,
	visitorsLabel = 'Visitors',
	pageviewsLabel = 'Pageviews',
	percentageLabel = 'Share',
}: MetricRowProps = {}): ColumnDef<MetricEntry>[] {
	const columns: ColumnDef<MetricEntry>[] = [];

	if (includeName) {
		columns.push({
			id: 'name',
			accessorKey: 'name',
			header: nameLabel,
			cell: (info: CellContext<MetricEntry, any>) => {
				const name = (info.getValue() as string) || '';
				return (
					<span className="font-medium text-foreground" title={name}>
						{name}
					</span>
				);
			},
		});
	}

	columns.push({
		id: 'visitors',
		accessorKey: 'visitors',
		header: visitorsLabel,
		cell: (info: CellContext<MetricEntry, any>) => {
			const value = info.getValue() as number;
			return (
				<div>
					<div className="font-medium">{formatNumber(value)}</div>
					<div className="text-muted-foreground text-xs">unique users</div>
				</div>
			);
		},
	});

	if (includePageviews) {
		columns.push({
			id: 'pageviews',
			accessorKey: 'pageviews',
			header: pageviewsLabel,
			cell: (info: CellContext<MetricEntry, any>) => {
				const value = info.getValue() as number;
				return (
					<div>
						<div className="font-medium">{formatNumber(value)}</div>
						<div className="text-muted-foreground text-xs">total views</div>
					</div>
				);
			},
		});
	}

	columns.push({
		id: 'percentage',
		accessorKey: 'percentage',
		header: percentageLabel,
		cell: (info: CellContext<MetricEntry, any>) => {
			const percentage = info.getValue() as number;
			return <PercentageBadge percentage={percentage} />;
		},
	});

	return columns;
}
