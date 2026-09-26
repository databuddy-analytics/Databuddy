"use client";

import { CountryFlag } from "@/components/icon";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatNumber } from "@/lib/formatters";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";
import type { CountryData } from "@/types/website";
import { SegmentedControl, Skeleton } from "@databuddy/ui";
import { useAtomValue } from "jotai";
import dynamic from "next/dynamic";
import { useParams, usePathname } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { Suspense, useMemo } from "react";

const MAP_VIEWS = ["realtime", "historical"] as const;

interface GeoRow {
	country_code?: string;
	country_name?: string;
	name: string;
	pageviews?: number;
	visitors: number;
}

interface RealtimeData extends Record<string, unknown[] | undefined> {
	active_stats?: { active_users: number }[];
	realtime_countries?: GeoRow[];
	realtime_velocity?: { events: number; pageviews: number }[];
}

interface HistoricalData extends Record<string, unknown[] | undefined> {
	country?: GeoRow[];
}

const REALTIME_QUERY = {
	id: "realtime-all",
	parameters: ["realtime_countries", "active_stats", "realtime_velocity"],
};

const MapComponent = dynamic(
	() =>
		import("@/components/analytics/map-component").then((mod) => ({
			default: mod.MapComponent,
		})),
	{
		loading: () => (
			<div className="flex h-full items-center justify-center">
				<Skeleton className="size-6 rounded-full" />
			</div>
		),
		ssr: false,
	}
);

function toCountries(rows: GeoRow[] = []): CountryData[] {
	return rows.map((row) => ({
		country: row.country_name || row.name,
		country_code: row.country_code || row.name,
		visitors: row.visitors,
		pageviews: row.pageviews ?? 0,
	}));
}

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

	const { dateRange } = useDateFilters();
	const filters = useAtomValue(dynamicQueryFiltersAtom);

	const historical = useDynamicQuery<HistoricalData>(
		id,
		dateRange,
		{ id: "map-countries", parameters: ["country"], limit: 200, filters },
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
			toCountries(
				isRealtime ? realtime.data.realtime_countries : historical.data.country
			),
		[isRealtime, realtime.data, historical.data]
	);

	const lastMinute = realtime.data.realtime_velocity?.at(-1);
	const totalVisitors = countries.reduce(
		(sum, country) => sum + country.visitors,
		0
	);
	const topVisitors = Math.max(0, ...countries.map((c) => c.visitors));

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
							<Stat label="visitors" value={totalVisitors} />
							<Stat label="countries" value={countries.length} />
						</>
					)}
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				<div className="shrink-0 max-lg:aspect-video lg:min-h-0 lg:flex-1">
					<MapComponent
						height="100%"
						isLoading={
							isRealtime
								? realtime.isLoading && !realtime.data.active_stats
								: historical.isLoading
						}
						locationData={{ countries, regions: [] }}
						showEmptyState={!isRealtime}
					/>
				</div>

				<aside className="flex min-h-0 flex-col border-t lg:w-72 lg:border-t-0 lg:border-l">
					<div className="flex h-10 shrink-0 items-center justify-between border-b px-4 text-muted-foreground text-xs">
						<span>Country</span>
						<span>{isRealtime ? "Active" : "Visitors"}</span>
					</div>
					{countries.length > 0 ? (
						<ul className="min-h-0 flex-1 overflow-y-auto">
							{countries.map((country) => (
								<li
									className="relative flex items-center gap-2.5 px-4 py-2 text-sm"
									key={country.country_code}
								>
									<span
										className="absolute inset-y-1 left-0 rounded-r bg-accent"
										style={{
											width: `${(country.visitors / topVisitors) * 100}%`,
										}}
									/>
									<CountryFlag
										country={country.country_code ?? country.country}
										size="sm"
									/>
									<span className="relative min-w-0 flex-1 truncate text-foreground">
										{country.country}
									</span>
									<span className="relative font-medium text-foreground tabular-nums">
										{formatNumber(country.visitors)}
									</span>
								</li>
							))}
						</ul>
					) : (
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
