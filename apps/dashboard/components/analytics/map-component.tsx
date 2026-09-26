"use client";

import { CountryFlag } from "@/components/icon";
import { useCountries } from "@/lib/geo";
import type { LocationData } from "@/types/website";
import { GlobeIcon } from "@databuddy/ui/icons";
import { scalePow } from "d3-scale";
import type { Feature, GeoJsonObject } from "geojson";
import type { Layer, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";

const MapContainer = dynamic(
	() => import("react-leaflet").then((mod) => mod.MapContainer),
	{ ssr: false }
);
const GeoJSON = dynamic(
	() => import("react-leaflet").then((mod) => mod.GeoJSON),
	{ ssr: false }
);

const WORLD_BOUNDS: [[number, number], [number, number]] = [
	[-56, -170],
	[80, 190],
];

function toApiCode(geoJsonCode: string): string {
	return geoJsonCode.toUpperCase() === "CN-TW" ? "TW" : geoJsonCode;
}

export function MapComponent({
	height,
	locationData,
	isLoading = false,
	showEmptyState = true,
}: {
	height: number | string;
	locationData?: LocationData;
	isLoading?: boolean;
	showEmptyState?: boolean;
}) {
	const mapRef = useRef<LeafletMap | null>(null);
	const attachMap = useCallback((map: LeafletMap | null) => {
		mapRef.current = map;
		if (!map) {
			return;
		}
		const observer = new ResizeObserver(() => {
			map.invalidateSize();
			map.fitBounds(WORLD_BOUNDS);
		});
		observer.observe(map.getContainer());
		return () => observer.disconnect();
	}, []);
	const { resolvedTheme } = useTheme();
	const [hovered, setHovered] = useState<{
		code: string;
		name: string;
	} | null>(null);

	const visitorsByCode = useMemo(() => {
		const counts = new Map<string, number>();
		for (const country of locationData?.countries ?? []) {
			if (country.country?.trim()) {
				counts.set(
					(country.country_code || country.country).toUpperCase(),
					country.visitors
				);
			}
		}
		return counts;
	}, [locationData?.countries]);

	const totalVisitors =
		[...visitorsByCode.values()].reduce((sum, count) => sum + count, 0) || 1;

	const themeColors = useMemo(() => {
		const isDark = resolvedTheme === "dark";
		return {
			fill: isDark ? "oklch(0.65 0.15 250" : "oklch(0.62 0.19 250",
			empty: isDark ? "oklch(0.25 0.005 260" : "oklch(0.94 0.005 260",
			border: isDark ? "oklch(0.35 0.01 260" : "oklch(0.88 0.01 260",
			borderHover: isDark ? "oklch(0.70 0.15 250" : "oklch(0.55 0.19 250",
		};
	}, [resolvedTheme]);

	const colorScale = useMemo(() => {
		const counts = [...visitorsByCode.values()];
		const nonZeroCounts = counts.filter((count) => count > 0);
		const scale = scalePow<number>()
			.exponent(0.5)
			.domain([
				nonZeroCounts.length > 0 ? Math.min(...nonZeroCounts) : 0,
				Math.max(0, ...counts),
			])
			.range([0.15, 0.9]);

		return (value: number) => {
			if (value === 0) {
				return `${themeColors.empty} / 1)`;
			}
			return `${themeColors.fill} / ${scale(value).toFixed(2)})`;
		};
	}, [visitorsByCode, themeColors]);

	const { data: countriesGeoData } = useCountries();
	const inhabitedCountries = useMemo(
		() =>
			countriesGeoData && {
				...countriesGeoData,
				features: countriesGeoData.features.filter(
					(feature) => feature.properties.ISO_A2 !== "AQ"
				),
			},
		[countriesGeoData]
	);

	const handleStyle = useCallback(
		(feature?: Feature) => {
			const geoJsonCode = feature?.properties?.ISO_A2 ?? "";
			const visitors = visitorsByCode.get(toApiCode(geoJsonCode)) ?? 0;
			const isHighlighted = visitors > 0 && hovered?.code === geoJsonCode;

			return {
				color: `${isHighlighted ? themeColors.borderHover : themeColors.border} / 1)`,
				weight: isHighlighted ? 1.5 : 0.5,
				fill: true,
				fillColor: colorScale(visitors),
				fillOpacity: 1,
				opacity: 1,
			};
		},
		[colorScale, visitorsByCode, hovered, themeColors]
	);

	const bindCountryEvents = (feature: Feature, layer: Layer) => {
		layer.on({
			mouseover: () =>
				setHovered({
					code: feature.properties?.ISO_A2 ?? "",
					name: feature.properties?.ADMIN ?? "",
				}),
			mouseout: () => setHovered(null),
			click: (e) => {
				const map = mapRef.current;
				map?.setView(e.latlng, Math.min(map.getZoom() + 1, 12));
			},
		});
	};

	const hoveredCode = hovered ? toApiCode(hovered.code) : null;
	const hoveredVisitors = hoveredCode
		? (visitorsByCode.get(hoveredCode) ?? 0)
		: 0;

	return (
		<div
			className="relative flex h-full w-full flex-col overflow-hidden bg-card"
			style={{ height }}
		>
			{isLoading && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="flex flex-col items-center gap-2">
						<GlobeIcon className="size-6 animate-pulse text-muted-foreground" />
						<span className="font-medium text-muted-foreground text-xs">
							Loading map data…
						</span>
					</div>
				</div>
			)}

			<MapContainer
				attributionControl={false}
				bounds={WORLD_BOUNDS}
				className={resolvedTheme === "dark" ? "map-dark" : "map-light"}
				maxZoom={12}
				minZoom={0}
				preferCanvas
				ref={attachMap}
				style={{
					height: "100%",
					backgroundColor: "hsl(var(--background))",
					cursor: "default",
					outline: "none",
					zIndex: "1",
				}}
				wheelPxPerZoomLevel={120}
				zoomControl={false}
				zoomDelta={0.5}
				zoomSnap={0.25}
			>
				{inhabitedCountries && (
					<GeoJSON
						data={inhabitedCountries as GeoJsonObject}
						onEachFeature={bindCountryEvents}
						style={handleStyle}
					/>
				)}
			</MapContainer>

			{showEmptyState && !isLoading && visitorsByCode.size === 0 && (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="text-center">
						<GlobeIcon className="mx-auto size-8 text-muted-foreground/40" />
						<p className="mt-2 font-medium text-foreground text-sm">
							No location data yet
						</p>
						<p className="mt-0.5 text-muted-foreground text-xs">
							Visitors will appear as traffic flows in
						</p>
					</div>
				</div>
			)}

			{hovered && hoveredCode && (
				<div className="pointer-events-none absolute top-3 left-3 z-20 rounded-md border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
					<div className="flex items-center gap-2">
						<CountryFlag country={hoveredCode} size={16} />
						<span className="font-semibold text-foreground text-sm">
							{hovered.name}
						</span>
					</div>
					<p className="mt-1 text-muted-foreground text-xs tabular-nums">
						{hoveredVisitors.toLocaleString()} visitors ·{" "}
						{((hoveredVisitors / totalVisitors) * 100).toFixed(1)}%
					</p>
				</div>
			)}
		</div>
	);
}
