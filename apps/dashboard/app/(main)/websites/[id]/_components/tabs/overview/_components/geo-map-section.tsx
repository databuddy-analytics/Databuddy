"use client";

import type { LocationData } from "@databuddy/shared/types/website";
import { GlobeIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Card } from "@/components/ds/card";
import { Skeleton } from "@/components/ds/skeleton";
import { CountryFlag } from "@/components/icon";
import { formatNumber } from "@/lib/formatters";

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
	country_code?: string;
	name: string;
	pageviews: number;
	visitors: number;
}

interface GeoMapSectionProps {
	countries: CountryDataItem[];
	isLoading: boolean;
}

export function GeoMapSection({ countries, isLoading }: GeoMapSectionProps) {
	const locationData = useMemo<LocationData>(
		() => ({
			countries: (countries ?? []).map((item) => ({
				country: item.name,
				country_code: (item.country_code ?? item.name).toUpperCase(),
				visitors: item.visitors,
				pageviews: item.pageviews,
			})),
			regions: [],
		}),
		[countries]
	);

	const topCountries = useMemo(
		() =>
			locationData.countries
				.filter((c) => c.country.trim() !== "")
				.sort((a, b) => b.visitors - a.visitors)
				.slice(0, 5),
		[locationData.countries]
	);

	const totalVisitors = useMemo(
		() => locationData.countries.reduce((sum, c) => sum + c.visitors, 0),
		[locationData.countries]
	);

	if (isLoading) {
		return (
			<Card>
				<Card.Header className="py-3">
					<Skeleton className="h-4 w-32 rounded" />
					<Skeleton className="h-3 w-48 rounded" />
				</Card.Header>
				<Skeleton className="h-[350px] w-full rounded-none" />
			</Card>
		);
	}

	return (
		<Card>
			<Card.Header className="py-3">
				<Card.Title className="text-sm">Visitor Locations</Card.Title>
				<Card.Description>Geographic distribution</Card.Description>
			</Card.Header>

			<div
				className="relative flex flex-col lg:flex-row"
				style={{ minHeight: 350 }}
			>
				<div className="relative flex-1 max-lg:aspect-video lg:min-h-0 [&>div]:rounded-none [&>div]:border-0">
					<MapComponent
						height="100%"
						isLoading={false}
						locationData={locationData}
					/>
				</div>

				<div className="absolute right-2 bottom-2 z-1 w-44 overflow-hidden rounded border border-border/60 bg-card shadow-sm">
					<div className="border-b bg-muted px-3 py-2">
						<span className="font-semibold text-foreground text-xs">
							Top Countries
						</span>
					</div>

					{topCountries.length > 0 ? (
						<div className="max-h-48 overflow-y-auto lg:max-h-none">
							{topCountries.map((country) => {
								const percentage =
									totalVisitors > 0
										? (country.visitors / totalVisitors) * 100
										: 0;

								return (
									<div
										className="flex items-center gap-2 border-border/60 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-accent/50"
										key={country.country}
									>
										<CountryFlag
											country={country.country_code ?? country.country}
											size="sm"
										/>
										<span className="min-w-0 flex-1 truncate text-foreground text-xs">
											{country.country}
										</span>
										<span className="shrink-0 font-medium text-foreground text-xs tabular-nums">
											{formatNumber(country.visitors)}
										</span>
										<span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
											{percentage.toFixed(0)}%
										</span>
									</div>
								);
							})}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center p-4 text-center">
							<GlobeIcon className="size-6 text-muted-foreground/50" />
							<p className="mt-2 text-muted-foreground text-xs">
								No location data
							</p>
						</div>
					)}
				</div>
			</div>
		</Card>
	);
}
