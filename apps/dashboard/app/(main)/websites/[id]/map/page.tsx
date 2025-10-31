'use client';

import type { LocationData } from '@databuddy/shared';
import { GlobeIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDateFilters } from '@/hooks/use-date-filters';
import { useMapLocationData } from '@/hooks/use-dynamic-query';
import { dynamicQueryFiltersAtom } from '@/stores/jotai/filterAtoms';

const MapComponent = dynamic(
	() =>
		import('@/components/analytics/map-component').then((mod) => ({
			default: mod.MapComponent,
		})),
	{
		loading: () => (
			<div className="flex h-full items-center justify-center rounded bg-muted/20">
				<div className="flex flex-col items-center gap-3">
					<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					<span className="font-medium text-muted-foreground text-sm">
						Loading map...
					</span>
				</div>
			</div>
		),
		ssr: false,
	}
);

interface CountryData {
	country: string;
	country_code?: string;
	visitors: number;
	pageviews: number;
}

interface CountryRowProps {
	country: CountryData;
	totalVisitors: number;
	onCountrySelect: (countryCode: string) => void;
}

function CountryRow({
	country,
	totalVisitors,
	onCountrySelect,
}: CountryRowProps) {
	const percentage =
		totalVisitors > 0 ? (country.visitors / totalVisitors) * 100 : 0;
	const getColor = (pct: number) =>
		pct >= 50
			? ['rgba(34, 197, 94, 0.08)', 'rgba(34, 197, 94, 0.8)']
			: pct >= 25
				? ['rgba(59, 130, 246, 0.08)', 'rgba(59, 130, 246, 0.8)']
				: pct >= 10
					? ['rgba(245, 158, 11, 0.08)', 'rgba(245, 158, 11, 0.8)']
					: ['rgba(107, 114, 128, 0.06)', 'rgba(107, 114, 128, 0.7)'];
	const [bgColor, accentColor] = getColor(percentage);

	return (
		<button
			className="flex w-full cursor-pointer items-center gap-2.5 px-1.5 py-1.5 text-left transition-all hover:opacity-80"
			onClick={() =>
				onCountrySelect(
					country.country_code?.toUpperCase() || country.country.toUpperCase()
				)
			}
			style={{
				background: percentage > 0 ? bgColor : undefined,
				boxShadow:
					percentage > 0 ? `inset 2px 0 0 0 ${accentColor}` : undefined,
			}}
			type="button"
		>
			<div className="relative h-4 w-5 flex-shrink-0 overflow-hidden border border-border/20 shadow-sm">
				<Image
					alt={`${country.country} flag`}
					className="object-cover"
					fill
					sizes="32p"
					src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${country.country_code?.toUpperCase() || country.country.toUpperCase()}.svg`}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between">
					<div className="truncate font-medium text-xs">{country.country}</div>
					<span className="ml-1 font-semibold text-primary text-xs">
						{country.visitors > 999
							? `${(country.visitors / 1000).toFixed(0)}k`
							: country.visitors.toString()}
					</span>
				</div>
			</div>
		</button>
	);
}

function WebsiteMapPage() {
	const { id } = useParams<{ id: string }>();
	const [mode] = useState<'total' | 'perCapita'>('total');
	const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);

	const handleCountrySelect = useCallback((countryCode: string) => {
		setSelectedCountry(countryCode);
	}, []);

	const { isLoading, getDataForQuery } = useMapLocationData(
		id,
		dateRange,
		filters
	);

	const countriesFromQuery = getDataForQuery('map-countries', 'country');
	const regionsFromQuery = getDataForQuery('map-regions', 'region');

	const locationData = useMemo<LocationData>(() => {
		const countries = (countriesFromQuery || []).map(
			(item: {
				name: string;
				visitors: number;
				pageviews: number;
				country_code?: string;
				country_name?: string;
			}) => ({
				country: item.country_name || item.name,
				country_code: item.country_code || item.name,
				visitors: item.visitors,
				pageviews: item.pageviews,
			})
		);
		const regions = (regionsFromQuery || []).map(
			(item: { name: string; visitors: number; pageviews: number }) => ({
				country: item.name,
				visitors: item.visitors,
				pageviews: item.pageviews,
			})
		);
		return { countries, regions };
	}, [countriesFromQuery, regionsFromQuery]);

	const topCountries = useMemo(
		() =>
			locationData.countries
				.filter((c) => c.country && c.country.trim() !== '')
				.sort((a, b) => b.visitors - a.visitors)
				.slice(0, 5),
		[locationData.countries]
	);

	const totalVisitors = useMemo(
		() =>
			locationData.countries.reduce(
				(sum, country) => sum + country.visitors,
				0
			),
		[locationData.countries]
	);

	if (!id) {
		return <div>No website ID</div>;
	}

	return (
		<div className="h-screen overflow-hidden">
			<div className="relative h-full w-full">
				<MapComponent
					height="100%"
					isLoading={isLoading}
					locationData={locationData}
					mode={mode}
					selectedCountry={selectedCountry}
				/>

				<div className="absolute top-2 right-2 z-20">
					<Card className="w-56 max-w-[90vw] gap-0 border-sidebar-border bg-background/95 py-0 shadow-xl backdrop-blur-md sm:w-64">
						<CardHeader className="px-3 pt-2.5 pb-2">
							<CardTitle className="flex items-center gap-1.5 font-semibold text-xs">
								<GlobeIcon
									className="h-3.5 w-3.5 text-primary"
									weight="duotone"
								/>
								Top Countries
							</CardTitle>
						</CardHeader>
						<CardContent className="p-0">
							{isLoading ? (
								<div className="space-y-1 px-3 pb-2">
									{new Array(5).fill(0).map((_, i) => (
										<div
											className="flex items-center gap-2.5 py-1.5"
											key={`country-skeleton-${i + 1}`}
										>
											<Skeleton className="h-2.5 w-4" />
											<Skeleton className="h-2.5 flex-1" />
											<Skeleton className="h-2.5 w-8" />
										</div>
									))}
								</div>
							) : topCountries.length > 0 ? (
								<div className="space-y-0.5">
									{topCountries.map((country) => (
										<CountryRow
											country={country}
											key={country.country}
											onCountrySelect={handleCountrySelect}
											totalVisitors={totalVisitors}
										/>
									))}

									<div className="border-border/50 border-t px-2 pt-1.5 pb-1.5">
										<div className="flex items-center justify-between text-xs">
											<span className="text-muted-foreground">Total</span>
											<span className="font-semibold text-primary">
												{totalVisitors > 999
													? `${(totalVisitors / 1000).toFixed(0)}k`
													: totalVisitors.toLocaleString()}
											</span>
										</div>
									</div>
								</div>
							) : (
								<div className="flex flex-col items-center justify-center px-3 py-6 text-center">
									<div className="mb-1.5 flex h-6 w-6 items-center justify-center bg-muted/20">
										<GlobeIcon
											className="h-3 w-3 text-muted-foreground/50"
											weight="duotone"
										/>
									</div>
									<p className="font-medium text-muted-foreground text-xs">
										No data
									</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

export default function Page() {
	return (
		<Suspense
			fallback={
				<div className="flex h-screen items-center justify-center">
					<div className="flex flex-col items-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
						<span className="font-medium text-muted-foreground text-sm">
							Loading...
						</span>
					</div>
				</div>
			}
		>
			<WebsiteMapPage />
		</Suspense>
	);
}
