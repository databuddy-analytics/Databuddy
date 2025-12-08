"use client";

import type { LocationData } from "@databuddy/shared/types/website";
import { GlobeIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { CountryFlag } from "@/components/icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useMapLocationData } from "@/hooks/use-dynamic-query";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";

const MapComponent = dynamic(
	() =>
		import("@/components/analytics/map-component").then((mod) => ({
			default: mod.MapComponent,
		})),
	{
		loading: () => (
			<div className="flex h-full items-center justify-center bg-accent">
				<div className="flex flex-col items-center gap-3">
					<div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					<span className="font-medium text-muted-foreground text-sm">
						Loading map…
					</span>
				</div>
			</div>
		),
		ssr: false,
	}
);

type CountryData = {
	country: string;
	country_code?: string;
	visitors: number;
	pageviews: number;
};

type CountryRowProps = {
	country: CountryData;
	totalVisitors: number;
	onCountrySelect: (countryCode: string) => void;
};

function CountryRow({
	country,
	totalVisitors,
	onCountrySelect,
}: CountryRowProps) {
	const percentage =
		totalVisitors > 0 ? (country.visitors / totalVisitors) * 100 : 0;
	// Colors from globals.css: success, chart-1, warning, muted
	const getColor = (pct: number) =>
		pct >= 50
			? ["oklch(0.60 0.22 150 / 0.08)", "oklch(0.60 0.22 150 / 0.8)"] // success
			: pct >= 25
				? ["oklch(0.81 0.1 252 / 0.08)", "oklch(0.81 0.1 252 / 0.8)"] // chart-1
				: pct >= 10
					? ["oklch(0.7 0.17 76 / 0.08)", "oklch(0.7 0.17 76 / 0.8)"] // warning
					: ["oklch(0.60 0.0079 240 / 0.06)", "oklch(0.60 0.0079 240 / 0.7)"]; // muted
	const [bgColor, accentColor] = getColor(percentage);

	return (
		<button
			className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent sm:gap-2.5 sm:px-2.5 sm:py-2"
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
			<CountryFlag
				className="sm:size-4"
				country={
					country.country_code?.toUpperCase() || country.country.toUpperCase()
				}
				size={14}
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium text-xs">{country.country}</p>
			</div>
			<span className="shrink-0 font-semibold text-xs tabular-nums">
				{country.visitors.toLocaleString()}
			</span>
		</button>
	);
}

function WebsiteMapPage() {
	const { id } = useParams<{ id: string }>();
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

	const countriesFromQuery = getDataForQuery("map-countries", "country");
	const regionsFromQuery = getDataForQuery("map-regions", "region");

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
				.filter((c) => c.country && c.country.trim() !== "")
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
		<div className="relative h-full w-full overflow-hidden">
			<MapComponent
				height="100%"
				isLoading={isLoading}
				locationData={locationData}
				selectedCountry={selectedCountry}
			/>

			<div className="absolute right-3 bottom-3 left-3 z-20 sm:top-3 sm:right-3 sm:bottom-auto sm:left-auto sm:w-60">
				<Card className="w-full gap-0 border bg-card/95 py-0 shadow-lg backdrop-blur-sm">
					<CardHeader className="border-b bg-accent px-2.5 py-2 sm:px-3 sm:py-2.5">
						<CardTitle className="flex items-center gap-2 font-semibold text-xs sm:text-sm">
							<GlobeIcon
								className="size-3.5 text-primary sm:size-4"
								weight="duotone"
							/>
							Top Countries
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						{isLoading ? (
							<div className="space-y-1 p-2 sm:p-3">
								{Array.from({ length: 5 }).map((_, i) => (
									<div
										className="flex items-center gap-2 py-1 sm:gap-2.5 sm:py-1.5"
										key={`country-skeleton-${i + 1}`}
									>
										<Skeleton className="size-3.5 rounded sm:size-4" />
										<Skeleton className="h-3 flex-1" />
										<Skeleton className="h-3 w-8" />
									</div>
								))}
							</div>
						) : topCountries.length > 0 ? (
							<div className="max-h-[40vh] space-y-0.5 overflow-y-auto p-1 sm:max-h-none sm:p-1.5">
								{topCountries.map((country) => (
									<CountryRow
										country={country}
										key={country.country}
										onCountrySelect={handleCountrySelect}
										totalVisitors={totalVisitors}
									/>
								))}
							</div>
						) : (
							<div className="flex flex-col items-center justify-center p-4 text-center sm:p-6">
								<GlobeIcon
									className="size-6 text-muted-foreground/30 sm:size-8"
									weight="duotone"
								/>
								<p className="mt-2 text-muted-foreground text-xs">
									No location data yet
								</p>
							</div>
						)}

						{topCountries.length > 0 && (
							<div className="flex items-center justify-between border-t bg-accent px-2.5 py-1.5 sm:px-3 sm:py-2">
								<span className="text-muted-foreground text-xs">Total</span>
								<span className="font-semibold text-xs tabular-nums sm:text-sm">
									{totalVisitors.toLocaleString()}
								</span>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

export default function Page() {
	return (
		<Suspense
			fallback={
				<div className="flex h-full items-center justify-center">
					<div className="flex flex-col items-center gap-3">
						<div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
						<span className="font-medium text-muted-foreground text-sm">
							Loading…
						</span>
					</div>
				</div>
			}
		>
			<WebsiteMapPage />
		</Suspense>
	);
}
