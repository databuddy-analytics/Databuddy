import { TranslateIcon } from '@phosphor-icons/react';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { PercentageBadge } from '@/components/ui/percentage-badge';

export interface LanguageEntry {
	name: string;
	visitors: number;
	pageviews: number;
	percentage: number;
	code?: string;
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

export function createLanguageColumns(
	displayNames?: Intl.DisplayNames | null
): ColumnDef<LanguageEntry>[] {
	// Use provided displayNames or create fallback
	const effectiveDisplayNames =
		displayNames ||
		(typeof window !== 'undefined'
			? new Intl.DisplayNames([navigator.language || 'en'], {
					type: 'language',
				})
			: null);

	return [
		{
			id: 'name',
			accessorKey: 'name',
			header: 'Language',
			cell: (info: CellContext<LanguageEntry, any>) => {
				const entry = info.row.original;
				const language = entry.name;
				const code = entry.code;
				let readableName = language;
				try {
					readableName = effectiveDisplayNames?.of(language) || language;
				} catch {
					readableName = language;
				}
				return (
					<div className="flex items-center gap-2">
						<TranslateIcon className="h-4 w-4 text-primary" />
						<div>
							<div className="font-medium">{readableName}</div>
							{code && code !== language && (
								<div className="text-muted-foreground text-xs">{code}</div>
							)}
						</div>
					</div>
				);
			},
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: (info: CellContext<LanguageEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: 'pageviews',
			accessorKey: 'pageviews',
			header: 'Pageviews',
			cell: (info: CellContext<LanguageEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: 'percentage',
			accessorKey: 'percentage',
			header: 'Share',
			cell: (info: CellContext<LanguageEntry, any>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
