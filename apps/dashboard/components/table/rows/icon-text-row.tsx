import type { CellContext, ColumnDef } from '@tanstack/react-table';
import type { ReactNode } from 'react';

export interface IconTextEntry {
	name: string;
	visitors: number;
	pageviews?: number;
	percentage?: number;
}

interface IconTextRowProps {
	header: string;
	accessorKey?: string;
	getIcon: (name: string, entry?: IconTextEntry) => ReactNode;
	getSubtitle?: (entry: IconTextEntry) => string | undefined;
	includeMetrics?: boolean;
}

export function createIconTextColumns({
	header,
	accessorKey = 'name',
	getIcon,
	getSubtitle,
	includeMetrics = true,
}: IconTextRowProps): ColumnDef<IconTextEntry>[] {
	const columns: ColumnDef<IconTextEntry>[] = [
		{
			id: accessorKey,
			accessorKey,
			header,
			cell: (info: CellContext<IconTextEntry, any>) => {
				const name = (info.getValue() as string) || '';
				const entry = info.row.original;
				const subtitle = getSubtitle?.(entry);

				return (
					<div className="flex items-center gap-3">
						{getIcon(name, entry)}
						<div>
							<div className="font-medium text-foreground">{name}</div>
							{subtitle && (
								<div className="text-muted-foreground text-xs">{subtitle}</div>
							)}
						</div>
					</div>
				);
			},
		},
	];

	if (includeMetrics) {
		const formatNumber = (value: number | null | undefined): string => {
			if (value == null || Number.isNaN(value)) {
				return '0';
			}
			return Intl.NumberFormat(undefined, {
				notation: 'compact',
				maximumFractionDigits: 1,
			}).format(value);
		};

		columns.push(
			{
				id: 'visitors',
				accessorKey: 'visitors',
				header: 'Visitors',
				cell: (info: CellContext<IconTextEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: (info: CellContext<IconTextEntry, any>) => {
					const percentage = info.getValue() as number;
					return (
						<div className="flex justify-end">
							<span className="font-medium">{percentage}%</span>
						</div>
					);
				},
			}
		);
	}

	return columns;
}
