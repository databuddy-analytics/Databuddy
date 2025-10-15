import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { PercentageBadge } from '@/components/ui/percentage-badge';

export interface PageEntry {
	name: string;
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

export function createPageColumns(): ColumnDef<PageEntry>[] {
	return [
		{
			id: 'name',
			accessorKey: 'name',
			header: 'Page',
			cell: ({ getValue }: CellContext<PageEntry, any>) => {
				const name = (getValue() as string) || '';
				return (
					<span className="font-medium text-foreground" title={name}>
						{name}
					</span>
				);
			},
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: ({ getValue }: CellContext<PageEntry, any>) => (
				<span className="font-medium text-foreground">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: 'pageviews',
			accessorKey: 'pageviews',
			header: 'Views',
			cell: ({ getValue }: CellContext<PageEntry, any>) => (
				<span className="font-medium text-foreground">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: 'percentage',
			accessorKey: 'percentage',
			header: 'Share',
			cell: ({ getValue }: CellContext<PageEntry, any>) => {
				const percentage = getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
