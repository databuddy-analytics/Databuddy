"use client";

import type { LocationData } from "@databuddy/shared/types/website";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { CountryFlag } from "@/components/icon";
import {
	chartLegendPillDotClassName,
	chartLegendPillLabelClassName,
	chartLegendPillRowClassName,
	chartSeriesColorAtIndex,
} from "@/lib/chart-presentation";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../types";
import { CaretDownIcon, GlobeIcon } from "@databuddy/ui/icons";
import { Card } from "@databuddy/ui";

const MAP_PLOT_HEIGHT = 280;

const MapComponent = dynamic(
	() =>
		import("@/components/analytics/map-component").then((mod) => ({
			default: mod.MapComponent,
		})),
	{
		loading: () => (
			<div
				className="flex items-center justify-center rounded bg-accent/90"
				style={{ height: MAP_PLOT_HEIGHT }}
			>
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

export function MiniMapRenderer({ title, countries, className }: MiniMapProps) {
	const topCountriesPanelId = useId();
	const topCountriesTriggerId = `${topCountriesPanelId}-trigger`;
	const [topCountriesOpen, setTopCountriesOpen] = useState(true);

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
				className={cn(
					"gap-0 overflow-hidden border-0 bg-secondary p-1",
					className
				)}
			>
				<div className="flex flex-col gap-1">
					<div className="flex items-center gap-2.5 rounded-md bg-background px-2.5 py-2">
						<div className="flex size-6 items-center justify-center rounded bg-accent">
							<GlobeIcon
								className="size-3.5 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<p className="min-w-0 flex-1 truncate font-medium text-sm">
							{title ?? "Geographic distribution"}
						</p>
					</div>
					<div className="rounded-md bg-background px-3 py-3">
						<div className="dotted-bg flex flex-col items-center justify-center gap-2 overflow-hidden rounded bg-accent/90 px-4 py-10 text-center">
							<GlobeIcon
								className="size-8 text-muted-foreground/40"
								weight="duotone"
							/>
							<p className="font-medium text-sm">No location data</p>
							<p className="text-pretty text-muted-foreground text-xs">
								Visitor locations will appear once traffic flows in
							</p>
						</div>
					</div>
				</div>
			</Card>
		);
	}

	return (
		<Card
			className={cn(
				"gap-0 overflow-hidden border-0 bg-secondary p-1",
				className
			)}
		>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2.5 rounded-md bg-background px-2 py-2">
					<div className="flex size-6 items-center justify-center rounded bg-accent">
						<GlobeIcon
							className="size-3.5 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<p className="min-w-0 flex-1 truncate font-medium text-sm">
						{title ?? "Geographic distribution"}
					</p>
				</div>

				<div className="rounded-md">
					<div className="dotted-bg overflow-hidden rounded-md">
						<div className="relative rounded" style={{ minHeight: MAP_PLOT_HEIGHT }}>
							<div className="h-[280px] [&>div]:rounded [&>div]:border-0">
								<MapComponent
									height="100%"
									isLoading={false}
									locationData={locationData}
								/>
							</div>

							<div className="absolute right-2 bottom-2 z-1 w-44 shrink-0 overflow-hidden rounded border border-border/50 bg-muted p-1">
								<div className="rounded">
									<button
										aria-controls={topCountriesPanelId}
										aria-expanded={topCountriesOpen}
										className="flex h-6 w-full items-center justify-between gap-1 rounded bg-muted px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
										id={topCountriesTriggerId}
										onClick={() => setTopCountriesOpen((open) => !open)}
										type="button"
									>
										<span className="font-semibold text-[10px] text-sidebar-foreground/70 uppercase">
											Top Countries
										</span>
										<CaretDownIcon
											aria-hidden
											className={cn(
												"size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
												topCountriesOpen && "rotate-180"
											)}
											weight="fill"
										/>
									</button>

									<motion.div
										animate={{
											height: topCountriesOpen ? "auto" : 0,
										}}
										className="overflow-hidden rounded"
										initial={false}
										transition={{ type: "spring", stiffness: 600, damping: 45 }}
									>
										<section
											aria-hidden={!topCountriesOpen}
											aria-labelledby={topCountriesTriggerId}
											className="mt-0.5 max-h-40 space-y-0.5 overflow-y-auto rounded"
											id={topCountriesPanelId}
										>
											{topCountries.length > 0 ? (
												topCountries.map((country) => {
													const safeVisitors =
														country.visitors == null ||
														Number.isNaN(country.visitors)
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
															className="flex items-center gap-2 rounded bg-background px-2 py-1.5 transition-colors hover:bg-accent"
															key={country.country}
														>
															<CountryFlag country={countryCode} size="sm" />
															<span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
																{country.country}
															</span>
															<div className="flex shrink-0 items-center gap-1 text-balance text-right">
																<span className="font-medium text-[11px] text-foreground tabular-nums">
																	{formatNumber(country.visitors)}
																</span>
																<span className="text-[9px] text-muted-foreground tabular-nums">
																	{percentage.toFixed(0)}%
																</span>
															</div>
														</div>
													);
												})
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
										</section>
									</motion.div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="flex w-full items-center justify-start rounded-md bg-background px-2.5 py-2.5">
					<p className="text-muted-foreground text-xs">
						{countries.length} {countries.length === 1 ? "country" : "countries"}
					</p>
				</div>
			</div>
		</Card>
	);
}
