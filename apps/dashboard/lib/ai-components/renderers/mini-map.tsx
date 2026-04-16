"use client";

import type { LocationData } from "@databuddy/shared/types/website";
import { GlobeIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { CountryFlag } from "@/components/icon";
import { Card } from "@/components/ui/card";
import type { BaseComponentProps } from "../types";

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

export interface CountryItem {
	country_code?: string;
	name: string;
	pageviews?: number;
	percentage?: number;
	visitors: number;
}

export interface MiniMapProps extends BaseComponentProps {
	countries: CountryItem[];
	title?: string;
}

function formatNumber(value: number): string {
	return Intl.NumberFormat(undefined, {
		notation: value > 9999 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(value);
}

export function MiniMapRenderer({ title, countries, className }: MiniMapProps) {
	const locationData = useMemo<LocationData>(() => {
		const processedCountries = (countries || []).map((item) => ({
			country: item.name,
			country_code: item.country_code || item.name,
			visitors: item.visitors,
			pageviews: item.pageviews || 0,
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

	if (countries.length === 0) {
		return (
			<Card
				className={className ?? "gap-0 overflow-hidden border bg-card py-0"}
			>
				{title && (
					<div className="border-b px-3 py-2">
						<p className="font-medium text-sm">{title}</p>
					</div>
				)}
				<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
					<GlobeIcon
						className="size-8 text-muted-foreground/40"
						weight="duotone"
					/>
					<p className="font-medium text-sm">No location data</p>
					<p className="text-muted-foreground text-xs">
						Visitor locations will appear once traffic flows in
					</p>
				</div>
			</Card>
		);
	}

	return (
		<Card className={className ?? "gap-0 overflow-hidden border bg-card py-0"}>
			{title && (
				<div className="border-b px-3 py-2">
					<p className="font-medium text-sm">{title}</p>
					<p className="mt-0.5 text-muted-foreground text-xs">
						Geographic distribution
					</p>
				</div>
			)}
			<div className="relative" style={{ minHeight: 280 }}>
				<div className="h-[280px] [&>div]:rounded-none [&>div]:border-0">
					<MapComponent
						height="100%"
						isLoading={false}
						locationData={locationData}
					/>
				</div>

				<div className="absolute right-2 bottom-2 z-1 w-44 shrink-0 rounded border border-t bg-muted">
					<div className="h-8 rounded-t border-b bg-muted px-2">
						<span className="flex h-full items-center font-semibold text-[10px] text-sidebar-foreground/70 uppercase">
							Top Countries
						</span>
					</div>

					{topCountries.length > 0 ? (
						<div className="max-h-40 overflow-y-auto rounded-b bg-background">
							{topCountries.map((country) => {
								const safeVisitors =
									country.visitors == null || Number.isNaN(country.visitors)
										? 0
										: country.visitors;
								const safeTotalVisitors =
									totalVisitors == null || Number.isNaN(totalVisitors)
										? 0
										: totalVisitors;
								const percentage =
									safeTotalVisitors > 0 &&
									!Number.isNaN(safeVisitors) &&
									!Number.isNaN(safeTotalVisitors)
										? (safeVisitors / safeTotalVisitors) * 100
										: 0;
								const countryCode =
									country.country_code?.toUpperCase() ||
									country.country.toUpperCase();

								return (
									<div
										className="flex items-center gap-2 border-b px-2 py-1.5 transition-colors last:border-b-0 hover:bg-accent/80"
										key={country.country}
									>
										<CountryFlag country={countryCode} size="sm" />
										<span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
											{country.country}
										</span>
										<div className="flex shrink-0 items-center gap-1 text-right">
											<span className="font-medium text-[11px] text-foreground tabular-nums">
												{formatNumber(country.visitors)}
											</span>
											<span className="text-[9px] text-muted-foreground tabular-nums">
												{percentage.toFixed(0)}%
											</span>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center bg-accent p-3 text-center">
							<GlobeIcon
								className="size-5 text-muted-foreground/30"
								weight="duotone"
							/>
							<p className="mt-1 text-[10px] text-muted-foreground">
								No location data
							</p>
						</div>
					)}
				</div>
			</div>
			<div className="border-t bg-muted/30 px-3 py-1.5">
				<p className="text-muted-foreground text-xs">
					{countries.length} {countries.length === 1 ? "country" : "countries"}
				</p>
			</div>
		</Card>
	);
}
