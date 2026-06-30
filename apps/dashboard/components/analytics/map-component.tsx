"use client";

import { CountryFlag } from "@/components/icon";
import { type Country, useCountries } from "@/lib/geo";
import type { CountryData, LocationData } from "@/types/website";
import { GlobeIcon } from "@databuddy/ui/icons";
import { scalePow } from "d3-scale";
import type { Feature, GeoJsonObject } from "geojson";
import type { Layer, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const MapContainer = dynamic(
	() => import("react-leaflet").then((mod) => mod.MapContainer),
	{ ssr: false }
);
const GeoJSON = dynamic(
	() => import("react-leaflet").then((mod) => mod.GeoJSON),
	{ ssr: false }
);

interface TooltipContent {
	code: string;
	count: number;
	name: string;
	percentage: number;
}

const mapApiToGeoJson = (code: string): string =>
	code === "TW" ? "CN-TW" : code;
const mapGeoJsonToApi = (code: string): string => {
	if (!code) {
		return code;
	}
	const upperCode = code.toUpperCase();
	return upperCode === "CN-TW" ? "TW" : code;
};

export function MapComponent({
	height,
	locationData,
	isLoading: passedIsLoading = false,
	selectedCountry,
}: {
	height: number | string;
	locationData?: LocationData;
	isLoading?: boolean;
	selectedCountry?: string | null;
}) {
	const mapRef = useRef<LeafletMap | null>(null);
	const locationsData = locationData;
	const { resolvedTheme } = useTheme();

	const countryData = useMemo(() => {
		if (!locationsData?.countries) {
			return null;
		}

		const validCountries = locationsData.countries.filter(
			(country: CountryData) => country.country && country.country.trim() !== ""
		);

		const totalVisitors =
			validCountries.reduce(
				(sum: number, c: CountryData) => sum + c.visitors,
				0
			) || 1;

		return {
			data: validCountries.map((country: CountryData) => ({
				value:
					country.country_code?.toUpperCase() || country.country.toUpperCase(),
				count: country.visitors,
				percentage: (country.visitors / totalVisitors) * 100,
			})),
		};
	}, [locationsData?.countries]);

	const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(
		null
	);
	const [mapView] = useState<"countries" | "subdivisions">("countries");
	const [hoveredId, setHoveredId] = useState<string | null>(null);

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
		if (!countryData?.data) {
			return () => `${themeColors.empty} / 1)`;
		}

		const values = countryData.data?.map((d: { count: number }) => d.count) || [
			0,
		];
		const maxValue = Math.max(...values);
		const nonZeroValues = values.filter((v: number) => v > 0);
		const minValue = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;

		const scale = scalePow<number>()
			.exponent(0.5)
			.domain([minValue || 0, maxValue])
			.range([0.15, 0.9]);

		return (value: number) => {
			if (value === 0) {
				return `${themeColors.empty} / 1)`;
			}
			const opacity = scale(value);
			return `${themeColors.fill} / ${opacity.toFixed(2)})`;
		};
	}, [countryData?.data, themeColors]);

	const { data: countriesGeoData } = useCountries();

	const handleStyle = useCallback(
		(feature?: Feature) => {
			if (!feature) {
				return {};
			}

			const dataKey = feature?.properties?.ISO_A2;
			const apiCode = mapGeoJsonToApi(dataKey ?? "");
			const foundData = countryData?.data?.find(
				({ value }: { value: string }) => value === apiCode
			);
			const metricValue = foundData?.count || 0;
			const isHovered = hoveredId === dataKey?.toString();
			const hasData = metricValue > 0;

			return {
				color:
					isHovered && hasData
						? `${themeColors.borderHover} / 1)`
						: `${themeColors.border} / 1)`,
				weight: isHovered && hasData ? 1.5 : 0.5,
				fill: true,
				fillColor: colorScale(metricValue),
				fillOpacity: 1,
				opacity: 1,
			};
		},
		[colorScale, countryData?.data, hoveredId, themeColors]
	);

	const handleEachFeature = useCallback(
		(feature: Feature, layer: Layer) => {
			layer.on({
				mouseover: () => {
					const code = feature.properties?.ISO_A2;
					setHoveredId(code);

					const name = feature.properties?.ADMIN;
					const apiCode = mapGeoJsonToApi(code ?? "");
					const foundData = countryData?.data?.find(
						({ value }) => value === apiCode
					);
					const count = foundData?.count || 0;
					const percentage = foundData?.percentage || 0;

					setTooltipContent({
						name,
						code: apiCode,
						count,
						percentage,
					});
				},
				mouseout: () => {
					setHoveredId(null);
					setTooltipContent(null);
				},
				click: (e) => {
					if (mapRef.current) {
						mapRef.current.setView(
							e.latlng,
							Math.min(mapRef.current.getZoom() + 1, 12)
						);
					}
				},
			});
		},
		[countryData?.data]
	);

	const zoom = 1.8;

	useEffect(() => {
		if (mapRef.current) {
			const mapContainer = mapRef.current.getContainer();
			if (mapContainer) {
				const bgColor = "hsl(var(--background))";
				mapContainer.style.backgroundColor = bgColor;
				const leafletContainer =
					mapContainer.querySelector(".leaflet-container");
				if (leafletContainer) {
					(leafletContainer as HTMLElement).style.backgroundColor = bgColor;
				}
			}
		}
	}, []);

	const calculateCountryCentroid = useCallback(
		(geometry: Country["features"][number]["geometry"]) => {
			let centroidLat = 0;
			let centroidLng = 0;
			let pointCount = 0;

			const processCoordinates = (
				coords: number[] | number[][] | number[][][]
			) => {
				if (typeof coords[0] === "number") {
					centroidLng += coords[0] as number;
					centroidLat += coords[1] as number;
					pointCount += 1;
				} else {
					for (const coord of coords) {
						processCoordinates(coord as number[] | number[][] | number[][][]);
					}
				}
			};

			if (geometry.type === "Polygon") {
				processCoordinates(geometry.coordinates[0]);
			} else if (geometry.type === "MultiPolygon") {
				for (const polygon of geometry.coordinates) {
					processCoordinates(polygon[0]);
				}
			}

			return pointCount > 0
				? {
						lat: centroidLat / pointCount,
						lng: centroidLng / pointCount,
					}
				: null;
		},
		[]
	);

	useEffect(() => {
		if (!(selectedCountry && mapRef.current && countriesGeoData)) {
			return;
		}

		const geoJsonCode = mapApiToGeoJson(selectedCountry);
		const countryFeature = countriesGeoData.features?.find(
			(feature) => feature.properties?.ISO_A2 === geoJsonCode
		);

		if (!countryFeature?.geometry) {
			return;
		}

		const centroid = calculateCountryCentroid(countryFeature.geometry);
		if (centroid) {
			mapRef.current.setView([centroid.lat, centroid.lng], 5);
		}
	}, [selectedCountry, countriesGeoData, calculateCountryCentroid]);

	return (
		<div
			className="relative flex h-full w-full flex-col overflow-hidden bg-card"
			style={{ height }}
		>
			{Boolean(passedIsLoading) && (
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
				center={[20, 10]}
				className={resolvedTheme === "dark" ? "map-dark" : "map-light"}
				maxBounds={[
					[-90, -200],
					[90, 200],
				]}
				maxBoundsViscosity={0.5}
				maxZoom={12}
				minZoom={1.0}
				preferCanvas
				ref={mapRef}
				style={{
					height: "100%",
					backgroundColor: "hsl(var(--background))",
					cursor: "default",
					outline: "none",
					zIndex: "1",
				}}
				wheelPxPerZoomLevel={120}
				zoom={zoom}
				zoomControl={false}
				zoomDelta={0.5}
				zoomSnap={0.25}
			>
				{mapView === "countries" && countriesGeoData && (
					<GeoJSON
						data={countriesGeoData as GeoJsonObject}
						key={`countries-${locationData?.countries?.length || 0}`}
						onEachFeature={handleEachFeature}
						style={handleStyle}
					/>
				)}
			</MapContainer>

			{!passedIsLoading &&
				(!locationData?.countries || locationData.countries.length === 0) && (
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

			{tooltipContent && (
				<div className="pointer-events-none absolute top-3 left-3 z-20 rounded-md border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
					<div className="flex items-center gap-2">
						<CountryFlag country={tooltipContent.code} size={16} />
						<span className="font-semibold text-foreground text-sm">
							{tooltipContent.name}
						</span>
					</div>
					<p className="mt-1 text-muted-foreground text-xs tabular-nums">
						{tooltipContent.count.toLocaleString()} visitors ·{" "}
						{(tooltipContent.percentage == null ||
						Number.isNaN(tooltipContent.percentage)
							? 0
							: tooltipContent.percentage
						).toFixed(1)}
						%
					</p>
				</div>
			)}
		</div>
	);
}
