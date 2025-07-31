'use client';

import { scalePow } from 'd3-scale';
import type { Feature, GeoJsonObject } from 'geojson';
import type { Layer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
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

function MapZoomController({ 
	selectedCountry, 
	countriesGeoData 
}: { 
	selectedCountry?: string | null;
	countriesGeoData: any;
}) {
	const map = useMap();

	useEffect(() => {
		if (!countriesGeoData || !map) {
			return;
		}

		if (!selectedCountry) {
			map.flyTo([40, 3], 1, {
				animate: true,
				duration: 1.2,
			});
			return;
		}

		const countryFeature = countriesGeoData.features?.find(
			(feature: Feature<any>) => 
				feature.properties?.ISO_A2 === selectedCountry ||
				feature.properties?.ADMIN?.toUpperCase() === selectedCountry?.toUpperCase() ||
				feature.properties?.NAME?.toUpperCase() === selectedCountry?.toUpperCase() ||
				feature.properties?.ISO_A3 === selectedCountry
		);

		if (countryFeature?.geometry) {
			try {
				const tempLayer = L.geoJSON(countryFeature);
				const bounds = tempLayer.getBounds();
				
				if (bounds && bounds.isValid && bounds.isValid()) {
					const latSpan = bounds.getNorth() - bounds.getSouth();
					const lngSpan = bounds.getEast() - bounds.getWest();
					const totalSpan = latSpan + lngSpan;
					
					// Special handling for US - bounds center doesn't work due to Alaska/Hawaii
					const isUSA = selectedCountry?.toUpperCase().includes('US') || 
								  selectedCountry?.toUpperCase().includes('UNITED STATES');
					
					if (isUSA) {
						// For USA, use continental US center
						map.flyTo([39.8283, -98.5795], 4, {
							animate: true,
							duration: 1.2,
						});
					} else if (totalSpan > 80) {
						const center = bounds.getCenter();
						const zoom = totalSpan > 150 ? 2 : totalSpan > 120 ? 3 : 4;
						
						map.flyTo(center, zoom, {
							animate: true,
							duration: 1.2,
						});
					} else {
						map.fitBounds(bounds, {
							padding: [20, 20],
							maxZoom: 8,
							animate: true,
							duration: 1.2,
						});
					}
				}
			} catch (error) {
				// Fallback: if bounds calculation fails, just center on the selected country
				const center: [number, number] = [40, 3];
				map.flyTo(center, 2, {
					animate: true,
					duration: 1.2,
				});
			}
		}
	}, [selectedCountry, countriesGeoData, map]);

	return null;
}

export function MapComponent({
	height,
	mode = 'total',
	locationData,
	isLoading: passedIsLoading = false,
	selectedCountry,
}: {
	height: string;
	mode?: 'total' | 'perCapita';
	locationData?: LocationData;
	isLoading?: boolean;
	selectedCountry?: string | null;
}) {
	const locationsData = locationData;

	const countryData = useMemo(() => {
		if (!locationsData?.countries) {
			return null;
		}

		const validCountries = locationsData.countries.filter(
			(country) => country.country && country.country.trim() !== ''
		);

		const totalVisitors =
			validCountries.reduce((sum, c) => sum + c.visitors, 0) || 1;

		return {
			data: validCountries.map((country) => ({
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

		return countryData.data.map((item) => {
			const population = getCountryPopulation(item.value);
			const perCapitaValue = population > 0 ? item.count / population : 0;
			return {
				...item,
				perCapita: perCapitaValue,
			};
		});
	}, [countryData?.data]);

	const colorScale = useMemo(() => {
		if (!processedCountryData) {
			return () => '#e5e7eb';
		}

		const metricToUse = mode === 'perCapita' ? 'perCapita' : 'count';
		const values = processedCountryData?.map((d) => d[metricToUse]) || [0];
		const maxValue = Math.max(...values);
		const nonZeroValues = values.filter((v) => v > 0);
		const minValue = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0;

		const baseBlue = '59, 130, 246';
		const lightBlue = '96, 165, 250';

		const scale = scalePow<number>()
			.exponent(0.5)
			.domain([minValue || 0, maxValue])
			.range([0.1, 1]);

		return (value: number) => {
			if (value === 0) {
				return 'rgba(51, 65, 85, 0.4)';
			}

			const intensity = scale(value);

			if (intensity < 0.3) {
				return `rgba(${lightBlue}, ${0.5 + intensity * 0.3})`;
			}
			if (intensity < 0.7) {
				return `rgba(${baseBlue}, ${0.7 + intensity * 0.2})`;
			}
			return `rgba(${baseBlue}, ${0.9 + intensity * 0.1})`;
		};
	}, [processedCountryData, mode]);

	const { data: countriesGeoData } = useCountries();

	const handleStyle = useCallback((feature: Feature<any>) => {
		const dataKey = feature?.properties?.ISO_A2;
		const foundData = processedCountryData?.find(
			({ value }) => value === dataKey
		);

		const metricValue =
			mode === 'perCapita' ? foundData?.perCapita || 0 : foundData?.count || 0;
		const fillColor = colorScale(metricValue);

		const isHovered = hoveredId === dataKey?.toString();
		const hasData = metricValue > 0;

		const borderColor = hasData
			? isHovered
				? 'rgba(148, 163, 184, 0.9)'
				: 'rgba(71, 85, 105, 0.8)'
			: 'rgba(51, 65, 85, 0.6)';

		const borderWeight = hasData ? (isHovered ? 2 : 1) : 0.8;
		const fillOpacity = hasData ? (isHovered ? 0.95 : 0.9) : 0.5;

		return {
			color: borderColor,
			weight: borderWeight,
			fill: true,
			fillColor,
			fillOpacity,
			opacity: 1,
			transition: 'all 0.2s ease-in-out',
			...(isHovered &&
				hasData && {
					filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
				}),
		};
	}, [processedCountryData, colorScale, hoveredId, mode]);

	const handleEachFeature = useCallback((feature: Feature<any>, layer: Layer) => {
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
		});
	}, [processedCountryData]);

	const containerRef = useRef<HTMLDivElement>(null);

	const initialZoom = useMemo(() => 1, []);
	const initialCenter = useMemo(() => [40, 3] as [number, number], []);
	const mapStyle = useMemo(() => ({
		height: '100%',
		background: '#0f172a',
		cursor: 'default',
		outline: 'none',
		zIndex: '1',
	}), []);

	return (
		<div
			className="relative"
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
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
					<div className="flex flex-col items-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
						<span className="font-medium text-slate-300 text-sm">
							Loading map data...
						</span>
					</div>
				</div>
			)}

			{countriesGeoData && (
				<MapContainer
					attributionControl={false}
					center={initialCenter}
					preferCanvas={true}
					style={mapStyle}
					zoom={initialZoom}
					zoomControl={false}
				>
					{mapView === 'countries' && countriesGeoData && (
						<GeoJSON
							data={countriesGeoData as GeoJsonObject}
							key="countries-map"
							onEachFeature={handleEachFeature}
							style={handleStyle as any}
						/>
					)}
					<MapZoomController 
						selectedCountry={selectedCountry} 
						countriesGeoData={countriesGeoData} 
					/>
				</MapContainer>
			)}

			{tooltipContent && (
				<div
					className="pointer-events-none fixed z-50 rounded-lg border border-slate-700 bg-slate-800 p-3 text-white text-sm shadow-2xl backdrop-blur-sm"
					style={{
						left: tooltipPosition.x,
						top: tooltipPosition.y - 10,
						transform: 'translate(-50%, -100%)',
						boxShadow:
							'0 20px 40px -10px rgba(0, 0, 0, 0.3), 0 8px 16px -4px rgba(0, 0, 0, 0.2)',
					}}
				>
					<div className="mb-1 flex items-center gap-2 font-medium">
						{tooltipContent.code && (
							<CountryFlag country={tooltipContent.code.slice(0, 2)} />
						)}
						<span className="text-white">
							{tooltipContent.name}
						</span>
					</div>
					<div className="space-y-1">
						<div>
							<span className="font-bold text-blue-400">
								{tooltipContent.count.toLocaleString()}
							</span>{' '}
							<span className="text-slate-300">
								({tooltipContent.percentage.toFixed(1)}%) visitors
							</span>
						</div>
						{mode === 'perCapita' && (
							<div className="text-slate-300 text-sm">
								<span className="font-bold text-blue-400">
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
