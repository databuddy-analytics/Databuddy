"use client";

import type {
	CountryData,
	LocationData,
} from "@databuddy/shared/types/website";
import { scalePow } from "d3-scale";
import type { Feature, GeoJsonObject } from "geojson";
import type { Layer, Map as LeafletMap } from "leaflet";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CountryFlag } from "@/components/icon";
import { type Country, useCountries } from "@/lib/geo";

const MapContainer = dynamic(
	() => import("react-leaflet").then((mod) => mod.MapContainer),
	{ ssr: false }
);
const GeoJSON = dynamic(
	() => import("react-leaflet").then((mod) => mod.GeoJSON),
	{ ssr: false }
);

type TooltipContent = {
	name: string;
	code: string;
	count: number;
	percentage: number;
};

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

	useEffect(() => {
		if (typeof window !== "undefined") {
			const link = document.createElement("link");
			link.rel = "stylesheet";
			link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
			link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
			link.crossOrigin = "anonymous";
			document.head.appendChild(link);

			return () => {
				document.head.removeChild(link);
			};
		}
	}, []);

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

	// Theme colors from globals.css (Leaflet needs actual values, not CSS vars)
	const themeColors = useMemo(() => {
		const isDark = resolvedTheme === "dark";
		return {
			// --chart-1: oklch(0.81 0.1 252)
			chart1: "oklch(0.81 0.1 252",
			// --chart-2: oklch(0.62 0.19 260)
			chart2: "oklch(0.62 0.19 260",
			// --chart-3: oklch(0.55 0.22 263)
			chart3: "oklch(0.55 0.22 263",
			// --muted: light oklch(0.60 0.0079 240) / dark oklch(0.50 0.006 286.033)
			muted: isDark ? "oklch(0.50 0.006 286.033" : "oklch(0.60 0.0079 240",
			// --secondary: light oklch(0.93 0.005 240) / dark oklch(0.28 0.006 286.033)
			secondary: isDark ? "oklch(0.28 0.006 286.033" : "oklch(0.93 0.005 240",
		};
	}, [resolvedTheme]);

	const colorScale = useMemo(() => {
		if (!countryData?.data) {
			return () => `${themeColors.secondary} / 0.6)`;
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
			.range([0.1, 1]);

		return (value: number) => {
			if (value === 0) {
				return `${themeColors.muted} / 0.6)`;
			}

			const intensity = scale(value);

			if (intensity < 0.3) {
				return `${themeColors.chart1} / ${(0.4 + intensity * 0.3).toFixed(2)})`;
			}
			if (intensity < 0.7) {
				return `${themeColors.chart2} / ${(0.6 + intensity * 0.3).toFixed(2)})`;
			}
			return `${themeColors.chart3} / ${(0.8 + intensity * 0.2).toFixed(2)})`;
		};
	}, [countryData?.data, themeColors]);

	const { data: countriesGeoData } = useCountries();

	const getBorderColor = useCallback(
		(hasData: boolean, isHovered: boolean) => {
			if (!hasData) {
				return `${themeColors.muted} / 0.5)`;
			}
			return isHovered
				? `${themeColors.chart2} / 1)`
				: `${themeColors.chart2} / 0.6)`;
		},
		[themeColors]
	);

	const getFeatureData = useCallback(
		(feature?: Feature) => {
			if (!feature) {
				return null;
			}

			const dataKey = feature?.properties?.ISO_A2;
			// Convert GeoJSON code to API code for data lookup
			const apiCode = mapGeoJsonToApi(dataKey ?? "");
			const foundData = countryData?.data?.find(
				({ value }: { value: string }) => value === apiCode
			);

			const metricValue = foundData?.count || 0;
			const isHovered = hoveredId === dataKey?.toString();
			const hasData = metricValue > 0;

			return { dataKey, foundData, metricValue, isHovered, hasData };
		},
		[countryData?.data, hoveredId]
	);

	const getStyleWeights = useCallback(
		(hasData: boolean, isHovered: boolean) => ({
			borderWeight: hasData ? (isHovered ? 2.5 : 1.5) : 1.0,
			fillOpacity: hasData ? (isHovered ? 0.95 : 0.85) : 0.4,
		}),
		[]
	);

	const handleStyle = useCallback(
		(feature?: Feature) => {
			if (!feature) {
				return {};
			}

			const featureData = getFeatureData(feature);
			if (!featureData) {
				return {};
			}

			const { metricValue, isHovered, hasData } = featureData;
			const fillColor = colorScale(metricValue);
			const borderColor = getBorderColor(hasData, isHovered);
			const weights = getStyleWeights(hasData, isHovered);

			const baseStyle = {
				color: borderColor,
				weight: weights.borderWeight,
				fill: true,
				fillColor,
				fillOpacity: weights.fillOpacity,
				opacity: 1,
				transition: "all 0.2s ease-in-out",
			};

			if (isHovered && hasData) {
				return {
					...baseStyle,
					filter:
						resolvedTheme === "dark"
							? "drop-shadow(0 2px 4px oklch(0 0 0 / 0.3))"
							: "drop-shadow(0 2px 4px oklch(0 0 0 / 0.1))",
					transform: "scale(1.02)",
					transformOrigin: "center",
				};
			}

			return baseStyle;
		},
		[colorScale, resolvedTheme, getBorderColor, getStyleWeights, getFeatureData]
	);

	const handleEachFeature = useCallback(
		(feature: Feature, layer: Layer) => {
			layer.on({
				mouseover: () => {
					const code = feature.properties?.ISO_A2;
					setHoveredId(code);

					const name = feature.properties?.ADMIN;
					// Convert GeoJSON code to API code for data lookup
					const apiCode = mapGeoJsonToApi(code ?? "");
					const foundData = countryData?.data?.find(
						({ value }) => value === apiCode
					);
					const count = foundData?.count || 0;
					const percentage = foundData?.percentage || 0;

					setTooltipContent({
						name,
						code: apiCode, // Use API code for flag display
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

	const zoom = 1.0;

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
			className="relative flex h-full w-full flex-col overflow-hidden rounded border bg-card"
			style={{ height }}
		>
			{Boolean(passedIsLoading) && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
					<div className="flex flex-col items-center gap-3">
						<div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
						<span className="font-medium text-muted-foreground text-sm">
							Loading map data...
						</span>
					</div>
				</div>
			)}

			{Boolean(countriesGeoData) && (
				<MapContainer
					attributionControl={false}
					center={[40, 3]}
					className={resolvedTheme === "dark" ? "map-dark" : "map-light"}
					maxBounds={[
						[-90, -200],
						[90, 200],
					]}
					maxBoundsViscosity={0.5}
					maxZoom={12}
					minZoom={0.5}
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
			)}

			{!passedIsLoading &&
				(!locationData?.countries || locationData.countries.length === 0) && (
					<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-center text-muted-foreground text-sm">
						<div>
							<p className="font-semibold text-foreground">No map data yet</p>
							<p>Visitors will appear as soon as traffic flows in.</p>
						</div>
					</div>
				)}

			<div className="pointer-events-none absolute top-3 left-3 z-20 flex max-w-[240px] flex-col gap-2 rounded border bg-card p-3 text-sm shadow-sm">
				<div className="flex items-center gap-2 font-semibold text-foreground">
					{tooltipContent?.code ? (
						<>
							<CountryFlag country={tooltipContent.code} />
							<span>{tooltipContent.name}</span>
						</>
					) : (
						<span>Move over a country</span>
					)}
				</div>
				<div className="text-muted-foreground text-xs">
					{tooltipContent ? (
						<>
							<span className="font-semibold text-foreground">
								{tooltipContent.count.toLocaleString()}
							</span>{" "}
							visitors ({tooltipContent.percentage.toFixed(1)}%)
						</>
					) : (
						"Hover to explore visitor share"
					)}
				</div>
			</div>

			<div className="pointer-events-none absolute bottom-3 left-3 z-20 flex w-[210px] flex-col gap-2 rounded border bg-card p-3 text-muted-foreground text-xs shadow-sm">
				<div className="flex items-center justify-between">
					<span>Lower share</span>
					<span>Higher share</span>
				</div>
				<div
					className="h-2 rounded-full"
					style={{
						background:
							"linear-gradient(90deg, oklch(0.81 0.1 252 / 0.4) 0%, oklch(0.55 0.22 263 / 0.95) 100%)",
					}}
				/>
			</div>
		</div>
	);
}
