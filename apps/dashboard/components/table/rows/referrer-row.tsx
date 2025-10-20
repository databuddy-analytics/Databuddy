import type { CellContext, ColumnDef } from '@tanstack/react-table';
import {
	ReferrerSourceCell,
	type ReferrerSourceCellData,
} from '@/components/atomic/ReferrerSourceCell';
import { PercentageBadge } from '@/components/ui/percentage-badge';

export interface ReferrerEntry extends ReferrerSourceCellData {
	visitors: number;
	pageviews: number;
	percentage: number;
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

export function createReferrerColumns(): ColumnDef<ReferrerEntry>[] {
	return [
		{
			id: 'name',
			accessorKey: 'name',
			header: 'Source',
			cell: ({ row }: CellContext<ReferrerEntry, any>) => (
				<ReferrerSourceCell {...row.original} />
			),
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: ({ getValue }: CellContext<ReferrerEntry, any>) => (
				<span className="font-medium text-foreground">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: 'pageviews',
			accessorKey: 'pageviews',
			header: 'Views',
			cell: ({ getValue }: CellContext<ReferrerEntry, any>) => (
				<span className="font-medium text-foreground">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: 'percentage',
			accessorKey: 'percentage',
			header: 'Share',
			cell: ({ getValue }: CellContext<ReferrerEntry, any>) => {
				const percentage = getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
