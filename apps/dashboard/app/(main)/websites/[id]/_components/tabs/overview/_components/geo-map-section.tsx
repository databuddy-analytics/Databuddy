"use client";

import type { LocationData } from "@databuddy/shared/types/website";
import { GlobeIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { CountryFlag } from "@/components/icon";
import { Skeleton } from "@/components/ui/skeleton";

const MapComponent = dynamic(
	() =>
		import("@/components/analytics/map-component").then((mod) => ({
			default: mod.MapComponent,
		})),
	{
		loading: () => (
			<div className="flex h-full items-center justify-center bg-accent">
				<div className="flex flex-col items-center gap-2">
					<div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					<span className="text-muted-foreground text-xs">Loading map…</span>
				</div>
			</div>
		),
		ssr: false,
	}
);

interface CountryDataItem {
	name: string;
	country_code?: string;
	visitors: number;
	pageviews: number;
}

interface GeoMapSectionProps {
	countries: CountryDataItem[];
	isLoading: boolean;
}

function formatNumber(value: number): string {
	if (value == null || Number.isNaN(value)) {
		return "0";
	}
	return Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

export function GeoMapSection({ countries, isLoading }: GeoMapSectionProps) {
	const locationData = useMemo<LocationData>(() => {
		const processedCountries = (countries || []).map((item) => ({
			country: item.name,
			country_code: item.country_code || item.name,
			visitors: item.visitors,
			pageviews: item.pageviews,
		}));
		return { countries: processedCountries, regions: [] };
	}, [countries]);

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

	if (isLoading) {
		return (
			<div className="w-full overflow-hidden rounded border bg-accent/50 backdrop-blur-sm">
				<div className="px-3 pt-3 pb-2">
					<div className="min-w-0 flex-1">
						<Skeleton className="h-5 w-32 rounded" />
						<Skeleton className="mt-0.5 h-3 w-48 rounded" />
					</div>
				</div>
				<div className="px-3 pb-3">
					<Skeleton className="h-[350px] w-full rounded" />
				</div>
			</div>
		);
	}

	return (
		<div className="w-full overflow-hidden rounded border bg-card backdrop-blur-sm">
			{/* Toolbar */}
			<div className="px-3 pt-3 pb-2">
				<div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
					<div className="min-w-0 flex-1">
						<h3 className="truncate font-semibold text-sidebar-foreground text-sm">
							Visitor Locations
						</h3>
						<p className="mt-0.5 line-clamp-2 text-sidebar-foreground/70 text-xs">
							Geographic distribution
						</p>
					</div>
				</div>
			</div>

			{/* Content */}
			<div
				className="relative flex flex-col lg:flex-row"
				style={{ minHeight: 350 }}
			>
				<div className="relative flex-1 max-lg:aspect-video lg:min-h-0 [&>div]:rounded-t-none [&>div]:border-0">
					<MapComponent
						height="100%"
						isLoading={false}
						locationData={locationData}
					/>
				</div>

				<div className="absolute right-2 bottom-2 z-1 w-44 shrink-0 rounded border border-t bg-muted">
					<div className="h-9 rounded-t border-b bg-muted px-2">
						<span className="flex h-full items-center font-semibold text-sidebar-foreground/70 text-xs uppercase">
							Top Countries
						</span>
					</div>

					{topCountries.length > 0 ? (
						<div className="max-h-48 overflow-y-auto rounded-b bg-background lg:max-h-none">
							{topCountries.map((country) => {
								const percentage =
									totalVisitors > 0
										? (country.visitors / totalVisitors) * 100
										: 0;
								const countryCode =
									country.country_code?.toUpperCase() ||
									country.country.toUpperCase();

								return (
									<div
										className="flex items-center gap-2 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-accent/80"
										key={country.country}
									>
										<CountryFlag country={countryCode} size="sm" />
										<span className="min-w-0 flex-1 truncate text-foreground text-xs">
											{country.country}
										</span>
										<div className="flex shrink-0 items-center gap-1.5 text-right">
											<span className="font-medium text-foreground text-xs tabular-nums">
												{formatNumber(country.visitors)}
											</span>
											<span className="text-[10px] text-muted-foreground tabular-nums">
												{percentage.toFixed(0)}%
											</span>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center bg-accent p-4 text-center">
							<GlobeIcon
								className="size-6 text-muted-foreground/30"
								weight="duotone"
							/>
							<p className="mt-2 text-muted-foreground text-xs">
								No location data
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
