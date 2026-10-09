"use client";

import { useMemo, useState } from "react";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { CountryFlag } from "@/components/icon";
import {
	type CountryRow,
	GlobeMap,
	toGlobeCountries,
} from "@/components/analytics/globe-map";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Card, Skeleton } from "@databuddy/ui";

interface GeoMapSectionProps {
	countries: CountryRow[];
	isLoading: boolean;
}

const TOP_COUNTRIES = 10;

export function GeoMapSection({ countries, isLoading }: GeoMapSectionProps) {
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
	return <VisitorLocations countries={countries} />;
}

function VisitorLocations({ countries }: { countries: CountryRow[] }) {
	const [focused, setFocused] = useState<string | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);

	const globeCountries = useMemo(
		() => toGlobeCountries(countries),
		[countries]
	);

	const topCountries = globeCountries.slice(0, TOP_COUNTRIES);
	const focusCode = topCountries.some((c) => c.code === focused)
		? focused
		: null;
	const totalVisitors = globeCountries.reduce((sum, c) => sum + c.value, 0);

	return (
		<Card>
			<Card.Header className="py-3">
				<Card.Title className="text-sm">Visitor locations</Card.Title>
				<Card.Description>Geographic distribution</Card.Description>
			</Card.Header>

			<div className="@container flex-1">
				<div
					className="flex h-full @lg:flex-row flex-col"
					style={{ minHeight: 350 }}
				>
					<div className="flex @lg:w-[42%] @lg:shrink-0 items-center justify-center p-4">
						<ChartErrorBoundary fallbackClassName="aspect-square w-full max-w-[320px]">
							<GlobeMap
								className="max-w-[320px]"
								countries={globeCountries}
								focusCode={focusCode}
								onHoverChange={setHovered}
							/>
						</ChartErrorBoundary>
					</div>

					<div className="flex min-w-0 flex-1 flex-col justify-center border-border/60 border-t @lg:border-t-0 @lg:border-l px-4 py-3">
						{topCountries.length > 0 ? (
							<ul>
								{topCountries.map((country) => {
									const share =
										totalVisitors > 0
											? (country.value / totalVisitors) * 100
											: 0;
									const isActive =
										country.code === hovered || country.code === focusCode;

									return (
										// biome-ignore lint/a11y/noNoninteractiveElementInteractions: hover only turns the globe; the row stays plain data
										<li
											className={cn(
												"flex items-center gap-3 rounded px-2 py-1.5 transition-colors",
												isActive && "bg-accent/60"
											)}
											key={country.code}
											onMouseEnter={() => setFocused(country.code)}
											onMouseLeave={() => setFocused(null)}
										>
											<CountryFlag country={country.code} size="sm" />
											<span className="min-w-0 flex-1 truncate text-foreground text-sm">
												{country.name}
											</span>
											<span className="h-1.5 w-2/5 shrink-0 overflow-hidden rounded-full bg-muted">
												<span
													className="block h-full rounded-full bg-[var(--info)] dark:bg-chart-4"
													style={{ width: `${Math.max(share, 1)}%` }}
												/>
											</span>
											<span className="w-12 shrink-0 text-right font-medium text-foreground text-sm tabular-nums">
												{formatNumber(country.value)}
											</span>
										</li>
									);
								})}
							</ul>
						) : (
							<div className="flex flex-col items-center justify-center gap-1 p-4 text-center">
								<p className="font-medium text-foreground text-sm">
									No location data yet
								</p>
								<p className="text-pretty text-muted-foreground text-xs">
									Countries light up on the globe as visitors arrive
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</Card>
	);
}
