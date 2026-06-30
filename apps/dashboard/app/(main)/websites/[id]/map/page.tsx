"use client";

import { useDateFilters } from "@/hooks/use-date-filters";
import { dynamicQueryFiltersAtom } from "@/stores/jotai/filterAtoms";
import type { LocationData } from "@/types/website";
import { Skeleton } from "@databuddy/ui";
import { useAtom } from "jotai";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { useMapLocationData } from "./use-map";

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

function WebsiteMapPage() {
	const { id } = useParams<{ id: string }>();

	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);

	const { isLoading, getDataForQuery } = useMapLocationData(
		id,
		dateRange,
		filters
	);

	const countriesFromQuery = getDataForQuery("map-countries", "country");
	const regionsFromQuery = getDataForQuery("map-regions-cities", "region");

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

	if (!id) {
		return null;
	}

	return (
		<div className="h-full w-full">
			<MapComponent
				height="100%"
				isLoading={isLoading}
				locationData={locationData}
			/>
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
