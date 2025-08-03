'use client';

import type { CountryData, LocationData } from '@databuddy/shared';
import { scalePow } from 'd3-scale';
import type { Feature, GeoJsonObject } from 'geojson';
import type { Layer, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, useMap } from 'react-leaflet';
import { getCountryPopulation } from '@/lib/data';
import { useCountries } from '@/lib/geo';
import { CountryFlag } from './icons/CountryFlag';

interface TooltipContent {
	name: string;
	code: string;
	count: number;
	percentage: number;
	perCapita?: number;
}

interface TooltipPosition {
	x: number;
	y: number;
}

const roundToTwo = (num: number): number => {
	return Math.round((num + Number.EPSILON) * 100) / 100;
};

function MapEvents({
	onClick,
}: {
	onClick: (latlng: { lat: number; lng: number }) => void;
}) {
	useMap().on('click', (e) => {
		onClick(e.latlng);
	});
	return null;
}

export function MapComponent({
	height,
	mode = 'total',
	locationData,
	isLoading: passedIsLoading = false,
	onCountrySelect: _onCountrySelect,
	selectedCountry,
}: {
	height: string;
	mode?: 'total' | 'perCapita';
	locationData?: LocationData;
	isLoading?: boolean;
	onCountrySelect?: (countryCode: string) => void;
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
			(country: CountryData) => country.country && country.country.trim() !== ''
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

	// Remove unnecessary dataVersion state and effect - use mode and locationData as keys instead

	const [tooltipContent, setTooltipContent] = useState<TooltipContent | null>(
		null
	);
	const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({
		x: 0,
		y: 0,
	});
	const [mapView] = useState<'countries' | 'subdivisions'>('countries');
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	const processedCountryData = useMemo(() => {
		if (!countryData?.data) {
			return null;
		}

		return countryData.data.map(
			(item: { value: string; count: number; percentage: number }) => {
				const population = getCountryPopulation(item.value);
				const perCapitaValue = population > 0 ? item.count / population : 0;
				return {
					...item,
					perCapita: perCapitaValue,
				};
			}
		);
	}, [countryData?.data]);

	const colorScale = useMemo(() => {
		if (!processedCountryData) {
			return () =>
				resolvedTheme === 'dark' ? 'hsl(240 3.7% 15.9%)' : 'hsl(210 40% 92%)';
		}

		const metricToUse = mode === 'perCapita' ? 'perCapita' : 'count';
		const values = processedCountryData?.map(
			(d: { count: number; perCapita: number }) => d[metricToUse]
		) || [0];
		const maxValue = Math.max(...values);
		const nonZeroValues = values.filter((v: number) => v > 0);
		const minValue = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;

		// More saturated blue color scheme
		const isDark = resolvedTheme === 'dark';
		const baseBlue = isDark ? '59, 130, 246' : '37, 99, 235'; // blue-500 / blue-600 (more saturated)
		const lightBlue = isDark ? '96, 165, 250' : '59, 130, 246'; // blue-400 / blue-500

		const scale = scalePow<number>()
			.exponent(0.5)
			.domain([minValue || 0, maxValue])
			.range([0.1, 1]);

		return (value: number) => {
			if (value === 0) {
				return isDark ? 'rgba(75, 85, 99, 0.6)' : 'rgba(229, 231, 235, 0.6)';
			}

			const intensity = scale(value);

			if (intensity < 0.3) {
				return `rgba(${lightBlue}, ${0.4 + intensity * 0.3})`;
			}
			if (intensity < 0.7) {
				return `rgba(${baseBlue}, ${0.6 + intensity * 0.3})`;
			}
			return `rgba(${baseBlue}, ${0.8 + intensity * 0.2})`;
		};
	}, [processedCountryData, mode, resolvedTheme]);

	const { data: countriesGeoData } = useCountries();

	const getThemeColors = useCallback(() => {
		const isDark = resolvedTheme === 'dark';
		return {
			// More saturated blue colors
			primary: isDark ? 'rgb(59, 130, 246)' : 'rgb(37, 99, 235)', // blue-500 / blue-600
			muted: isDark ? 'rgb(75, 85, 99)' : 'rgb(156, 163, 175)', // gray-600 / gray-400
			isDark,
		};
	}, [resolvedTheme]);

	const getBorderColor = useCallback(
		(
			hasData: boolean,
			isHovered: boolean,
			colors: ReturnType<typeof getThemeColors>
		) => {
			if (!hasData) {
				return `${colors.muted.replace(')', ', 0.5)')}`;
			}
			return isHovered
				? colors.primary
				: `${colors.primary.replace(')', ', 0.6)')}`;
		},
		[]
	);

	const getFeatureData = useCallback(
		(feature?: Feature) => {
			if (!feature) {
				return null;
			}

			const dataKey = feature?.properties?.ISO_A2;
			const foundData = processedCountryData?.find(
				({ value }: { value: string }) => value === dataKey
			);

			const metricValue =
				mode === 'perCapita'
					? foundData?.perCapita || 0
					: foundData?.count || 0;
			const isHovered = hoveredId === dataKey?.toString();
			const hasData = metricValue > 0;

			return { dataKey, foundData, metricValue, isHovered, hasData };
		},
		[processedCountryData, mode, hoveredId]
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
			const colors = getThemeColors();
			const borderColor = getBorderColor(hasData, isHovered, colors);
			const weights = getStyleWeights(hasData, isHovered);

			const baseStyle = {
				color: borderColor,
				weight: weights.borderWeight,
				fill: true,
				fillColor,
				fillOpacity: weights.fillOpacity,
				opacity: 1,
				transition: 'all 0.2s ease-in-out',
			};

			if (isHovered && hasData) {
				return {
					...baseStyle,
					filter: colors.isDark
						? 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
						: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
					transform: 'scale(1.02)',
					transformOrigin: 'center',
				};
			}

			return baseStyle;
		},
		[
			colorScale,
			getThemeColors,
			getBorderColor,
			getStyleWeights,
			getFeatureData,
		]
	);

	const handleEachFeature = useCallback(
		(feature: Feature, layer: Layer) => {
			layer.on({
				mouseover: () => {
					const code = feature.properties?.ISO_A2;
					setHoveredId(code);

					const name = feature.properties?.ADMIN;
					const foundData = processedCountryData?.find(
						({ value }) => value === code
					);
					const count = foundData?.count || 0;
					const percentage = foundData?.percentage || 0;
					const perCapita = foundData?.perCapita || 0;

					setTooltipContent({
						name,
						code,
						count,
						percentage,
						perCapita,
					});
				},
				mouseout: () => {
					setHoveredId(null);
					setTooltipContent(null);
				},
				click: (e) => {
					if (mapRef.current) {
						// Use flyTo with smooth animation and duration
						mapRef.current.flyTo(
							e.latlng,
							Math.min(mapRef.current.getZoom() + 2, 8),
							{
								animate: true,
								duration: 1.5,
								easeLinearity: 0.25,
							}
						);
					}
				},
			});
		},
		[processedCountryData]
	);

	const containerRef = useRef<HTMLDivElement>(null);
	const [resolvedHeight, setResolvedHeight] = useState<number>(0);

	useEffect(() => {
		const updateHeight = () => {
			if (containerRef.current) {
				setResolvedHeight(containerRef.current.clientHeight);
			}
		};

		updateHeight();
		window.addEventListener('resize', updateHeight);
		return () => window.removeEventListener('resize', updateHeight);
	}, []);

	const zoom = resolvedHeight ? Math.log2(resolvedHeight / 400) + 1 : 1;

	// Fix map background color after mount
	useEffect(() => {
		if (mapRef.current) {
			const mapContainer = mapRef.current.getContainer();
			if (mapContainer) {
				const bgColor = resolvedTheme === 'dark' ? '#1f2937' : '#f8fafc';
				mapContainer.style.backgroundColor = bgColor;
				// Also set it on the leaflet-container class
				const leafletContainer =
					mapContainer.querySelector('.leaflet-container');
				if (leafletContainer) {
					(leafletContainer as HTMLElement).style.backgroundColor = bgColor;
				}
			}
		}
	}, [resolvedTheme]);

	// Helper function to calculate country centroid
	const calculateCountryCentroid = useCallback((geometry: any) => {
		let centroidLat = 0;
		let centroidLng = 0;
		let pointCount = 0;

		const processCoordinates = (
			coords: number[] | number[][] | number[][][]
		) => {
			if (typeof coords[0] === 'number') {
				// Single coordinate pair
				centroidLng += coords[0] as number;
				centroidLat += coords[1] as number;
				pointCount += 1;
			} else {
				// Array of coordinates
				for (const coord of coords) {
					processCoordinates(coord as number[] | number[][] | number[][][]);
				}
			}
		};

		if (geometry.type === 'Polygon') {
			processCoordinates(geometry.coordinates[0]);
		} else if (geometry.type === 'MultiPolygon') {
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
	}, []);

	// Fly to selected country
	useEffect(() => {
		if (!(selectedCountry && mapRef.current && countriesGeoData)) {
			return;
		}

		// Find the country feature in the GeoJSON data
		const countryFeature = countriesGeoData.features?.find(
			(feature: any) => feature.properties?.ISO_A2 === selectedCountry
		);

		if (!countryFeature?.geometry) {
			return;
		}

		const centroid = calculateCountryCentroid(countryFeature.geometry);
		if (centroid) {
			// Fly to the country with smooth animation
			mapRef.current.flyTo([centroid.lat, centroid.lng], 5, {
				animate: true,
				duration: 2,
				easeLinearity: 0.25,
			});
		}
	}, [selectedCountry, countriesGeoData, calculateCountryCentroid]);

	return (
		<div
			className="relative cursor-pointer"
			onMouseMove={(e) => {
				if (tooltipContent) {
					setTooltipPosition({
						x: e.clientX,
						y: e.clientY,
					});
				}
			}}
			ref={containerRef}
			role="tablist"
			style={{ height }}
		>
			{passedIsLoading && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
					<div className="flex flex-col items-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
						<span className="font-medium text-muted-foreground text-sm">
							Loading map data...
						</span>
					</div>
				</div>
			)}

			{countriesGeoData && (
				<MapContainer
					attributionControl={false}
					center={[40, 3]}
					className={resolvedTheme === 'dark' ? 'map-dark' : 'map-light'}
					preferCanvas
					ref={mapRef}
					style={{
						height: '100%',
						backgroundColor:
							resolvedTheme === 'dark'
								? '#1f2937 !important'
								: '#fffff !important',
						cursor: 'default',
						outline: 'none',
						zIndex: '1',
					}}
					zoom={zoom}
					zoomControl={false}
				>
					<MapEvents
						onClick={(latlng) => {
							if (mapRef.current) {
								// Use flyTo with smooth animation for map background clicks
								mapRef.current.flyTo(
									latlng,
									Math.min(mapRef.current.getZoom() + 1, 6),
									{
										animate: true,
										duration: 1.2,
										easeLinearity: 0.2,
									}
								);
							}
						}}
					/>
					{mapView === 'countries' && countriesGeoData && (
						<GeoJSON
							data={countriesGeoData as GeoJsonObject}
							key={`countries-${mode}-${locationData?.countries?.length || 0}`}
							onEachFeature={handleEachFeature}
							style={handleStyle}
						/>
					)}
				</MapContainer>
			)}

			{tooltipContent && (
				<div
					className="pointer-events-none fixed z-50 rounded border bg-popover p-3 text-popover-foreground text-sm shadow-xl backdrop-blur-sm"
					style={{
						left: tooltipPosition.x,
						top: tooltipPosition.y - 10,
						transform: 'translate(-50%, -100%)',
						boxShadow:
							resolvedTheme === 'dark'
								? '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)'
								: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
					}}
				>
					<div className="mb-1 flex items-center gap-2 font-medium">
						{tooltipContent.code && (
							<CountryFlag country={tooltipContent.code.slice(0, 2)} />
						)}
						<span className="text-foreground">{tooltipContent.name}</span>
					</div>
					<div className="space-y-1">
						<div>
							<span className="font-bold text-blue-600 dark:text-blue-500">
								{tooltipContent.count.toLocaleString()}
							</span>{' '}
							<span className="text-muted-foreground">
								({tooltipContent.percentage.toFixed(1)}%) visitors
							</span>
						</div>
						{mode === 'perCapita' && (
							<div className="text-muted-foreground text-sm">
								<span className="font-bold text-blue-600 dark:text-blue-500">
									{roundToTwo(tooltipContent.perCapita ?? 0)}
								</span>{' '}
								per million people
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
