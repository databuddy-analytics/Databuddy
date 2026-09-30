"use client";

import { useMemo } from "react";
import { type GlobeCountry, GlobeMap } from "@/components/analytics/globe-map";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { CountryFlag } from "@/components/icon";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { BaseComponentProps } from "../types";
import { GlobeIcon } from "@databuddy/ui/icons";
import { Card } from "@databuddy/ui";

const TOP_COUNTRIES = 5;

interface CountryItem {
	country_code?: string;
	name: string;
	visitors: number;
}

export interface MiniMapProps extends BaseComponentProps {
	countries: CountryItem[];
	title?: string;
}

export function MiniMapRenderer({ title, countries, className }: MiniMapProps) {
	const globeCountries = useMemo<GlobeCountry[]>(
		() =>
			countries
				.filter((item) => item.name.trim() !== "")
				.map((item) => ({
					code: (item.country_code || item.name).toUpperCase(),
					name: item.name,
					value: item.visitors,
				}))
				.sort((a, b) => b.value - a.value),
		[countries]
	);
	const totalVisitors = globeCountries.reduce((sum, c) => sum + c.value, 0);

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
						<GlobeIcon className="size-3.5 text-muted-foreground" />
					</div>
					<p className="min-w-0 flex-1 truncate font-medium text-sm">
						{title ?? "Geographic distribution"}
					</p>
				</div>

				{globeCountries.length > 0 ? (
					<>
						<div className="@container rounded-md bg-background">
							<div className="flex @md:flex-row flex-col items-center gap-3 p-3">
								<ChartErrorBoundary fallbackClassName="aspect-square w-full max-w-[220px]">
									<GlobeMap
										className="max-w-[220px] shrink-0"
										countries={globeCountries}
									/>
								</ChartErrorBoundary>
								<ul className="w-full min-w-0 flex-1">
									{globeCountries.slice(0, TOP_COUNTRIES).map((country) => (
										<li
											className="flex items-center gap-2 px-2 py-1.5"
											key={country.code}
										>
											<CountryFlag country={country.code} size="sm" />
											<span className="min-w-0 flex-1 truncate text-foreground text-xs">
												{country.name}
											</span>
											<span className="font-medium text-foreground text-xs tabular-nums">
												{formatNumber(country.value)}
											</span>
											<span className="w-8 text-right text-[10px] text-muted-foreground tabular-nums">
												{totalVisitors > 0
													? Math.round((country.value / totalVisitors) * 100)
													: 0}
												%
											</span>
										</li>
									))}
								</ul>
							</div>
						</div>
						<div className="rounded-md bg-background px-2.5 py-2.5">
							<p className="text-muted-foreground text-xs">
								{globeCountries.length}{" "}
								{globeCountries.length === 1 ? "country" : "countries"}
							</p>
						</div>
					</>
				) : (
					<div className="rounded-md bg-background px-3 py-3">
						<div className="dotted-bg flex flex-col items-center justify-center gap-2 overflow-hidden rounded bg-accent/90 px-4 py-10 text-center">
							<GlobeIcon className="size-8 text-muted-foreground/40" />
							<p className="font-medium text-sm">No location data</p>
							<p className="text-pretty text-muted-foreground text-xs">
								Visitor locations will appear once traffic flows in
							</p>
						</div>
					</div>
				)}
			</div>
		</Card>
	);
}
