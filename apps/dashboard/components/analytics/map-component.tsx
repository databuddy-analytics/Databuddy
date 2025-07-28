'use client';

import { scalePow } from 'd3-scale';
import type { Feature, GeoJsonObject } from 'geojson';
import type { Layer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer } from 'react-leaflet';
import { getCountryPopulation } from '@/lib/data';
import { useCountries } from '@/lib/geo';
import type { LocationData } from '@databuddy/shared';
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

export function MapComponent({
	height,
	mode = 'total',
	locationData,
	isLoading: passedIsLoading = false,
}: {
	height: string;
	mode?: 'total' | 'perCapita';
	locationData?: LocationData;
	isLoading?: boolean;
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

	const [dataVersion, setDataVersion] = useState<number>(0);

	useEffect(() => {
		if (countryData) {
			setDataVersion((prev) => prev + 1);
		}
	}, [countryData]);

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
		const lightBlue = '147, 197, 253';

		const scale = scalePow<number>()
			.exponent(0.5)
			.domain([minValue || 0, maxValue])
			.range([0.1, 1]);

		return (value: number) => {
			if (value === 0) {
				return 'rgba(229, 231, 235, 0.6)';
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
	}, [processedCountryData, mode]);

	const { data: countriesGeoData } = useCountries();

	const handleStyle = (feature: Feature<any>) => {
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
				? 'rgba(59, 130, 246, 0.9)'
				: 'rgba(59, 130, 246, 0.6)'
			: 'rgba(156, 163, 175, 0.5)';

		const borderWeight = hasData ? (isHovered ? 2.5 : 1.5) : 1.0;
		const fillOpacity = hasData ? (isHovered ? 0.95 : 0.85) : 0.4;

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
	};

	const handleEachFeature = (feature: Feature<any>, layer: Layer) => {
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
			click: () => {
				// Functionality removed
			},
		});
	};

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
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm dark:bg-gray-900/70">
					<div className="flex flex-col items-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
						<span className="font-medium text-gray-700 text-sm dark:text-gray-300">
							Loading map data...
						</span>
					</div>
				</div>
			)}

			{countriesGeoData && (
				<MapContainer
					attributionControl={false}
					center={[40, 3]}
					preferCanvas={true}
					style={{
						height: '100%',
						background: 'rgba(248, 250, 252, 0.8)',
						cursor: 'default',
						outline: 'none',
						zIndex: '1',
					}}
					zoom={zoom}
					zoomControl={false}
				>
					{mapView === 'countries' && countriesGeoData && (
						<GeoJSON
							data={countriesGeoData as GeoJsonObject}
							key={`countries-${dataVersion}-${mode}`}
							onEachFeature={handleEachFeature}
							style={handleStyle as any}
						/>
					)}
				</MapContainer>
			)}

			{tooltipContent && (
				<div
					className="pointer-events-none fixed z-50 rounded-lg border border-gray-200 bg-white p-3 text-gray-900 text-sm shadow-xl backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
					style={{
						left: tooltipPosition.x,
						top: tooltipPosition.y - 10,
						transform: 'translate(-50%, -100%)',
						boxShadow:
							'0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
					}}
				>
					<div className="mb-1 flex items-center gap-2 font-medium">
						{tooltipContent.code && (
							<CountryFlag country={tooltipContent.code.slice(0, 2)} />
						)}
						<span className="text-gray-900 dark:text-white">
							{tooltipContent.name}
						</span>
					</div>
					<div className="space-y-1">
						<div>
							<span className="font-bold text-blue-600 dark:text-blue-400">
								{tooltipContent.count.toLocaleString()}
							</span>{' '}
							<span className="text-gray-600 dark:text-gray-400">
								({tooltipContent.percentage.toFixed(1)}%) visitors
							</span>
						</div>
						{mode === 'perCapita' && (
							<div className="text-gray-600 text-sm dark:text-gray-400">
								<span className="font-bold text-blue-600 dark:text-blue-400">
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
