"use client";

import {
	type CountryRow,
	GlobeMap,
	toGlobeCountries,
} from "@/components/analytics/globe-map";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { CountryFlag } from "@/components/icon";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";
import { SegmentedControl, Skeleton } from "@databuddy/ui";
import { useAtomValue } from "jotai";
import { useParams, usePathname } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, useMemo, useState } from "react";

const MAP_VIEWS = ["realtime", "historical"] as const;

interface RealtimeData extends Record<string, unknown[] | undefined> {
	active_stats?: { active_users: number }[];
	realtime_countries?: CountryRow[];
	realtime_velocity?: { events: number; pageviews: number }[];
}

interface HistoricalData extends Record<string, unknown[] | undefined> {
	country?: CountryRow[];
	summary_metrics?: { unique_visitors: number }[];
}

const REALTIME_QUERY = {
	id: "realtime-all",
	parameters: ["realtime_countries", "active_stats", "realtime_velocity"],
};

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<span className="flex items-baseline gap-1.5">
			<span className="font-semibold text-foreground text-sm tabular-nums">
				{value.toLocaleString()}
			</span>
			<span className="text-muted-foreground text-xs">{label}</span>
		</span>
	);
}

function WebsiteMapPage() {
	const { id } = useParams<{ id: string }>();
	const isDemo = usePathname().startsWith("/demo");
	const [selectedView, setView] = useQueryState(
		"view",
		parseAsStringLiteral(MAP_VIEWS).withDefault("realtime")
	);
	const view = isDemo ? "historical" : selectedView;
	const isRealtime = view === "realtime";

	const [focused, setFocused] = useState<string | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);

	const { dateRange } = useDateFilters();
	const filters = useAtomValue(dynamicQueryFiltersAtom);

	const historical = useDynamicQuery<HistoricalData>(
		id,
		dateRange,
		{
			id: "map-countries",
			parameters: ["country", "summary_metrics"],
			limit: 200,
			filters,
		},
		{ enabled: !isRealtime }
	);

	const realtimeRange = useMemo(() => {
		const now = new Date();
		return {
			start_date: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
			end_date: now.toISOString(),
		};
	}, []);

	const realtime = useDynamicQuery<RealtimeData>(
		id,
		realtimeRange,
		REALTIME_QUERY,
		{
			enabled: isRealtime,
			refetchInterval: 5000,
			staleTime: 0,
			gcTime: 10_000,
		}
	);

	const countries = useMemo(
		() =>
			toGlobeCountries(
				(isRealtime
					? realtime.data.realtime_countries
					: historical.data.country) ?? []
			),
		[isRealtime, realtime.data, historical.data]
	);

	const isLoading = isRealtime
		? realtime.isLoading && !realtime.data.active_stats
		: historical.isLoading && !historical.data.country;
	const focusCode = countries.some((c) => c.code === focused) ? focused : null;
	const lastMinute = realtime.data.realtime_velocity?.at(-1);
	const topVisitors = Math.max(0, ...countries.map((c) => c.value));

	return (
		<div className="flex h-full w-full flex-col">
			<div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4">
				{isDemo ? (
					<span className="font-medium text-foreground text-sm">
						Visitor locations
					</span>
				) : (
					<SegmentedControl
						onChange={setView}
						options={[
							{
								label: (
									<span className="flex items-center gap-1.5">
										<span className="relative flex size-1.5">
											{isRealtime && (
												<span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
											)}
											<span className="relative inline-flex size-1.5 rounded-full bg-success" />
										</span>
										Realtime
									</span>
								),
								value: "realtime",
							},
							{ label: "Historical", value: "historical" },
						]}
						size="sm"
						value={view}
					/>
				)}

				<div className="flex items-center gap-4">
					{isRealtime ? (
						<>
							<Stat
								label="active"
								value={realtime.data.active_stats?.[0]?.active_users ?? 0}
							/>
							<Stat label="views/m" value={lastMinute?.pageviews ?? 0} />
							<Stat label="events/m" value={lastMinute?.events ?? 0} />
						</>
					) : (
						<>
							<Stat
								label="visitors"
								value={
									historical.data.summary_metrics?.[0]?.unique_visitors ?? 0
								}
							/>
							<Stat label="countries" value={countries.length} />
						</>
					)}
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				<div className="flex shrink-0 items-center justify-center p-6 [container-type:size] max-lg:aspect-square max-lg:max-h-[60svh] lg:min-h-0 lg:flex-1">
					<ChartErrorBoundary fallbackClassName="aspect-square w-[min(100cqw,100cqh)]">
						<GlobeMap
							className="w-[min(100cqw,100cqh)]"
							countries={countries}
							focusCode={focusCode}
							isLive={isRealtime && !isLoading}
							onHoverChange={setHovered}
						/>
					</ChartErrorBoundary>
				</div>

				<aside className="flex min-h-0 flex-col border-t lg:w-72 lg:border-t-0 lg:border-l">
					<div className="flex h-10 shrink-0 items-center justify-between border-b px-4 text-muted-foreground text-xs">
						<span>Country</span>
						<span>{isRealtime ? "Active" : "Visitors"}</span>
					</div>
					{isLoading && (
						<div className="flex flex-col gap-1 p-2" role="status">
							{Array.from({ length: 8 }, (_, index) => (
								<Skeleton
									className="h-8 w-full rounded"
									key={`country-${index + 1}`}
								/>
							))}
						</div>
					)}
					{!isLoading && countries.length > 0 && (
						<ul className="min-h-0 flex-1 overflow-y-auto">
							{countries.map((country) => (
								// biome-ignore lint/a11y/noNoninteractiveElementInteractions: hover only turns the globe; the row stays plain data
								<li
									className={cn(
										"relative flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
										(country.code === hovered || country.code === focusCode) &&
											"bg-muted"
									)}
									key={country.code}
									onMouseEnter={() => setFocused(country.code)}
									onMouseLeave={() => setFocused(null)}
								>
									<span
										className="absolute inset-y-1 left-0 rounded-r bg-accent"
										style={{
											width: `${(country.value / topVisitors) * 100}%`,
										}}
									/>
									<CountryFlag country={country.code} size="sm" />
									<span className="relative min-w-0 flex-1 truncate text-foreground">
										{country.name}
									</span>
									<span className="relative font-medium text-foreground tabular-nums">
										{formatNumber(country.value)}
									</span>
								</li>
							))}
						</ul>
					)}
					{!isLoading && countries.length === 0 && (
						<p className="px-4 py-6 text-center text-muted-foreground text-xs">
							{isRealtime
								? "Nobody is on the site right now"
								: "No visitors in this date range"}
						</p>
					)}
				</aside>
			</div>
		</div>
	);
}

export default function Page() {
	return (
		<Suspense
			fallback={
				<div className="flex h-full items-center justify-center">
					<Skeleton className="size-6 rounded-full" />
				</div>
			}
		>
			<WebsiteMapPage />
		</Suspense>
	);
}
