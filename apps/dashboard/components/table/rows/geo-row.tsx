import { MapPinIcon } from '@phosphor-icons/react';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { CountryFlag } from '@/components/analytics/icons/CountryFlag';
import { PercentageBadge } from '@/components/ui/percentage-badge';

export interface GeoEntry {
	name: string;
	visitors: number;
	pageviews: number;
	percentage: number;
	country_code?: string;
	country_name?: string;
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

interface GeoRowProps {
	type: 'country' | 'region' | 'city';
}

export function createGeoColumns({ type }: GeoRowProps): ColumnDef<GeoEntry>[] {
	return [
		{
			id: type,
			accessorKey: type === 'country' ? 'country_name' : 'name',
			header: type.charAt(0).toUpperCase() + type.slice(1),
			cell: (info: CellContext<GeoEntry, any>) => {
				const entry = info.row.original;
				const name = (info.getValue() as string) || '';
				const countryCode = entry.country_code;
				const countryName = entry.country_name;

				const getIcon = () => {
					if (type === 'country') {
						if (countryCode && countryCode !== 'Unknown') {
							return (
								<img
									alt={countryCode}
									className="h-4 w-5 rounded-sm bg-muted object-cover"
									onError={(e) => {
										(e.target as HTMLImageElement).style.display = 'none';
									}}
									src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${countryCode.toUpperCase()}.svg`}
								/>
							);
						}
						return <CountryFlag country={''} size={16} />;
					}

					// Region and City
					if (countryCode) {
						return <CountryFlag country={countryCode} size={16} />;
					}
					return <MapPinIcon className="h-4 w-4 text-primary" />;
				};

				const formatName = () => {
					if (type === 'country') {
						return name || 'Unknown';
					}
					// Region and City format: "Name, Country"
					if (countryName && name) {
						return `${name}, ${countryName}`;
					}
					return name || `Unknown ${type}`;
				};

				return (
					<div className="flex items-center gap-2">
						{getIcon()}
						<span className="font-medium">{formatName()}</span>
					</div>
				);
			},
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: (info: CellContext<GeoEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: 'pageviews',
			accessorKey: 'pageviews',
			header: 'Pageviews',
			cell: (info: CellContext<GeoEntry, any>) => (
				<span className="font-medium">{formatNumber(info.getValue())}</span>
			),
		},
		{
			id: 'percentage',
			accessorKey: 'percentage',
			header: 'Share',
			cell: (info: CellContext<GeoEntry, any>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}
