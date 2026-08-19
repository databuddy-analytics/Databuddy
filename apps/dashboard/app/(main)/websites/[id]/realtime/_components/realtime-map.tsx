"use client";

import type { FeatureCollection, Geometry } from "geojson";
import { type GeoPermissibleObjects, geoNaturalEarth1, geoPath } from "d3-geo";
import { useEffect, useRef, useState } from "react";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-110m.json";
import { COUNTRY_NAME_TO_ISO_NUMERIC } from "./country-codes";

interface Country {
	country_code: string;
	country_name?: string;
	visitors: number;
}

interface RealtimeMapProps {
	countries: Country[];
}

interface TooltipState {
	name: string;
	visitors: number;
	x: number;
	y: number;
}

interface MapGeometry {
	baseCanvas: HTMLCanvasElement;
	countryPixels: Map<number, number[]>;
	height: number;
	hitMap: Uint16Array;
	width: number;
}

const BAYER = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
];

const GRID_SIZE = 3;
const MAX_DEVICE_PIXEL_RATIO = 2;

const WORLD_FEATURES = (
	feature(
		worldTopo,
		worldTopo.objects.countries
	) as unknown as FeatureCollection<Geometry>
).features;

function getCssColor(name: string, fallback: string): string {
	return (
		getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
		fallback
	);
}

function getCountryId(countryCode: string): number | undefined {
	return COUNTRY_NAME_TO_ISO_NUMERIC[countryCode.toUpperCase()];
}

function buildMapGeometry(
	width: number,
	height: number,
	background: string,
	border: string
): MapGeometry {
	const projection = geoNaturalEarth1().fitExtent(
		[
			[-40, -10],
			[width + 40, height + 10],
		],
		{ type: "Sphere" } as GeoPermissibleObjects
	);
	const path = geoPath(projection);
	const baseCanvas = document.createElement("canvas");
	baseCanvas.width = width;
	baseCanvas.height = height;

	const baseContext = baseCanvas.getContext("2d");
	if (!baseContext) {
		throw new Error("Unable to create the realtime map canvas");
	}

	baseContext.fillStyle = background;
	baseContext.fillRect(0, 0, width, height);
	for (const country of WORLD_FEATURES) {
		baseContext.beginPath();
		path.context(baseContext)(country);
		baseContext.fillStyle = background;
		baseContext.fill();
		baseContext.strokeStyle = border;
		baseContext.lineWidth = 0.5;
		baseContext.stroke();
	}

	const countryPixels = new Map<number, number[]>();
	const hitMap = new Uint16Array(width * height);

	for (const country of WORLD_FEATURES) {
		const countryId = Number(country.id);
		if (!Number.isInteger(countryId) || countryId <= 0 || countryId > 65_535) {
			continue;
		}

		const bounds = path.bounds(country);
		const minX = Math.max(0, Math.floor(bounds[0][0] - 1));
		const minY = Math.max(0, Math.floor(bounds[0][1] - 1));
		const maxX = Math.min(width - 1, Math.ceil(bounds[1][0] + 1));
		const maxY = Math.min(height - 1, Math.ceil(bounds[1][1] + 1));
		const localWidth = maxX - minX + 1;
		const localHeight = maxY - minY + 1;

		if (localWidth <= 0 || localHeight <= 0) {
			continue;
		}

		const countryCanvas = document.createElement("canvas");
		countryCanvas.width = localWidth;
		countryCanvas.height = localHeight;
		const countryContext = countryCanvas.getContext("2d");
		if (!countryContext) {
			continue;
		}

		countryContext.translate(-minX, -minY);
		countryContext.beginPath();
		path.context(countryContext)(country);
		countryContext.fillStyle = "white";
		countryContext.fill();

		const pixels = countryContext.getImageData(
			0,
			0,
			localWidth,
			localHeight
		).data;
		const activePixels: number[] = [];

		for (let y = minY; y <= maxY; y += GRID_SIZE) {
			for (let x = minX; x <= maxX; x += GRID_SIZE) {
				const localX = x - minX;
				const localY = y - minY;
				const alpha = pixels[(localY * localWidth + localX) * 4 + 3] ?? 0;
				if (alpha > 100) {
					activePixels.push(x, y);
				}
			}
		}

		if (activePixels.length > 0) {
			countryPixels.set(countryId, activePixels);
		}

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const localX = x - minX;
				const localY = y - minY;
				const alpha = pixels[(localY * localWidth + localX) * 4 + 3] ?? 0;
				if (alpha > 100) {
					hitMap[y * width + x] = countryId;
				}
			}
		}
	}

	return { baseCanvas, countryPixels, hitMap, height, width };
}

export function RealtimeMap({ countries }: RealtimeMapProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef<number | null>(null);
	const countriesRef = useRef<Country[]>(countries);
	const numericToCountryRef = useRef<Map<number, Country>>(new Map());
	const brightnessRef = useRef(
		new Map<number, { target: number; value: number }>()
	);
	const mapGeometryRef = useRef<MapGeometry | null>(null);
	const viewRef = useRef({ scale: 1, x: 0, y: 0 });
	const dragRef = useRef<{
		startX: number;
		startY: number;
		ox: number;
		oy: number;
	} | null>(null);
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);
	countriesRef.current = countries;

	useEffect(() => {
		const canvas = canvasRef.current;
		const wrapper = wrapperRef.current;
		if (!(canvas && wrapper)) {
			return;
		}

		const context = canvas.getContext("2d");
		if (!context) {
			return;
		}

		let destroyed = false;
		let devicePixelRatio = 1;
		let last = performance.now();
		let hoveredId: number | null = null;
		let background = "transparent";
		let accent = "transparent";

		const applyTransform = () => {
			const { scale, x, y } = viewRef.current;
			canvas.style.transform = `scale(${scale}) translate(${x}px, ${y}px)`;
			canvas.style.imageRendering = scale > 1.5 ? "pixelated" : "auto";
		};

		const resize = () => {
			const width = Math.floor(wrapper.clientWidth || wrapper.offsetWidth);
			const height = Math.floor(wrapper.clientHeight || wrapper.offsetHeight);
			if (width <= 0 || height <= 0) {
				return;
			}

			devicePixelRatio = Math.min(
				window.devicePixelRatio || 1,
				MAX_DEVICE_PIXEL_RATIO
			);
			canvas.width = Math.round(width * devicePixelRatio);
			canvas.height = Math.round(height * devicePixelRatio);
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
			background = getCssColor("--background", background);
			accent = getCssColor("--chart-4", accent);

			mapGeometryRef.current = buildMapGeometry(
				width,
				height,
				background,
				getCssColor("--border", "transparent")
			);
			brightnessRef.current.clear();
			numericToCountryRef.current.clear();
			hoveredId = null;
			setTooltip(null);
			viewRef.current = { scale: 1, x: 0, y: 0 };
			applyTransform();
		};

		const draw = (timestamp: number) => {
			if (destroyed) {
				return;
			}

			const geometry = mapGeometryRef.current;
			if (!geometry) {
				rafRef.current = requestAnimationFrame(draw);
				return;
			}

			const delta = Math.min(timestamp - last, 50);
			last = timestamp;
			const activeCountries = countriesRef.current;
			const maxVisitors = activeCountries.reduce(
				(max, country) => Math.max(max, country.visitors),
				1
			);

			numericToCountryRef.current.clear();
			for (const country of activeCountries) {
				const countryId = getCountryId(country.country_code);
				if (countryId === undefined) {
					continue;
				}

				numericToCountryRef.current.set(countryId, country);
				const target = Math.min(
					0.3 + (Math.max(0, country.visitors) / maxVisitors) * 0.7,
					1
				);
				const brightness = brightnessRef.current.get(countryId);
				if (brightness) {
					brightness.target = target;
				} else {
					brightnessRef.current.set(countryId, { target, value: 0 });
				}
			}

			for (const [countryId, brightness] of brightnessRef.current) {
				if (!numericToCountryRef.current.has(countryId)) {
					brightness.target = 0;
				}
				if (brightness.value < brightness.target) {
					brightness.value = Math.min(
						brightness.target,
						brightness.value + delta / 400
					);
				} else {
					brightness.value = Math.max(0, brightness.value - delta / 2000);
				}
			}

			context.fillStyle = background;
			context.fillRect(0, 0, geometry.width, geometry.height);
			context.drawImage(geometry.baseCanvas, 0, 0);

			for (const [countryId, brightness] of brightnessRef.current) {
				if (brightness.value <= 0) {
					continue;
				}
				const pixels = geometry.countryPixels.get(countryId);
				if (!pixels) {
					continue;
				}

				context.fillStyle = countryId === hoveredId ? "white" : accent;
				for (let index = 0; index < pixels.length; index += 2) {
					const x = pixels[index] ?? 0;
					const y = pixels[index + 1] ?? 0;
					const threshold =
						(BAYER[Math.floor(y / GRID_SIZE) % 4]?.[
							Math.floor(x / GRID_SIZE) % 4
						] ?? 0) / 16;
					if (brightness.value > threshold) {
						context.fillRect(x, y, 2, 2);
					}
				}
			}

			if (hoveredId !== null && !numericToCountryRef.current.has(hoveredId)) {
				const pixels = geometry.countryPixels.get(hoveredId);
				if (pixels) {
					context.fillStyle = "white";
					context.globalAlpha = 0.15;
					for (let index = 0; index < pixels.length; index += 2) {
						context.fillRect(pixels[index] ?? 0, pixels[index + 1] ?? 0, 2, 2);
					}
					context.globalAlpha = 1;
				}
				hoveredId = null;
				setTooltip(null);
			}

			rafRef.current = requestAnimationFrame(draw);
		};

		const setHoveredCountry = (event: PointerEvent) => {
			const geometry = mapGeometryRef.current;
			if (!geometry) {
				return;
			}

			const rect = canvas.getBoundingClientRect();
			const scaleX = geometry.width / rect.width;
			const scaleY = geometry.height / rect.height;
			const x = Math.floor((event.clientX - rect.left) * scaleX);
			const y = Math.floor((event.clientY - rect.top) * scaleY);

			if (x < 0 || x >= geometry.width || y < 0 || y >= geometry.height) {
				hoveredId = null;
				setTooltip(null);
				return;
			}

			const countryId = geometry.hitMap[y * geometry.width + x] ?? 0;
			if (!countryId) {
				hoveredId = null;
				setTooltip(null);
				return;
			}

			hoveredId = countryId;
			const country = numericToCountryRef.current.get(countryId);
			if (!country) {
				setTooltip(null);
				return;
			}

			const wrapperRect = wrapper.getBoundingClientRect();
			setTooltip({
				name: country.country_name || country.country_code,
				visitors: country.visitors,
				x: event.clientX - wrapperRect.left,
				y: event.clientY - wrapperRect.top,
			});
		};

		const handleWheel = (event: WheelEvent) => {
			event.preventDefault();
			const view = viewRef.current;
			view.scale = Math.min(
				5,
				Math.max(1, view.scale * (event.deltaY > 0 ? 0.9 : 1.1))
			);
			if (view.scale === 1) {
				view.x = 0;
				view.y = 0;
			}
			applyTransform();
		};

		const handlePointerDown = (event: PointerEvent) => {
			if (viewRef.current.scale <= 1) {
				return;
			}
			event.preventDefault();
			dragRef.current = {
				startX: event.clientX,
				startY: event.clientY,
				ox: viewRef.current.x,
				oy: viewRef.current.y,
			};
			wrapper.setPointerCapture(event.pointerId);
			wrapper.style.cursor = "grabbing";
		};

		const handlePointerMove = (event: PointerEvent) => {
			if (dragRef.current) {
				const scale = viewRef.current.scale;
				viewRef.current.x =
					dragRef.current.ox + (event.clientX - dragRef.current.startX) / scale;
				viewRef.current.y =
					dragRef.current.oy + (event.clientY - dragRef.current.startY) / scale;
				applyTransform();
				return;
			}
			setHoveredCountry(event);
		};

		const handlePointerUp = (event: PointerEvent) => {
			dragRef.current = null;
			if (wrapper.hasPointerCapture(event.pointerId)) {
				wrapper.releasePointerCapture(event.pointerId);
			}
			wrapper.style.cursor = viewRef.current.scale > 1 ? "grab" : "";
		};

		const handlePointerLeave = () => {
			if (dragRef.current) {
				return;
			}
			hoveredId = null;
			setTooltip(null);
		};

		const handleDoubleClick = () => {
			viewRef.current = { scale: 1, x: 0, y: 0 };
			applyTransform();
		};

		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(wrapper);
		resize();
		wrapper.addEventListener("wheel", handleWheel, { passive: false });
		wrapper.addEventListener("pointerdown", handlePointerDown);
		wrapper.addEventListener("pointermove", handlePointerMove);
		wrapper.addEventListener("pointerup", handlePointerUp);
		wrapper.addEventListener("pointercancel", handlePointerUp);
		wrapper.addEventListener("pointerleave", handlePointerLeave);
		wrapper.addEventListener("dblclick", handleDoubleClick);
		rafRef.current = requestAnimationFrame(draw);

		return () => {
			destroyed = true;
			resizeObserver.disconnect();
			wrapper.removeEventListener("wheel", handleWheel);
			wrapper.removeEventListener("pointerdown", handlePointerDown);
			wrapper.removeEventListener("pointermove", handlePointerMove);
			wrapper.removeEventListener("pointerup", handlePointerUp);
			wrapper.removeEventListener("pointercancel", handlePointerUp);
			wrapper.removeEventListener("pointerleave", handlePointerLeave);
			wrapper.removeEventListener("dblclick", handleDoubleClick);
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, []);

	return (
		<div
			aria-label="Realtime visitor map"
			className="relative h-full w-full touch-none overflow-hidden"
			ref={wrapperRef}
			role="img"
		>
			<canvas className="origin-center" ref={canvasRef} />
			{tooltip && (
				<div
					className="pointer-events-none absolute z-10 rounded border border-border/60 bg-popover px-2.5 py-1.5 text-xs shadow-md"
					style={{
						left: tooltip.x,
						top: tooltip.y - 36,
						transform: "translateX(-50%)",
					}}
				>
					<span className="font-bold">{tooltip.name}</span>
					<span className="text-muted-foreground">
						{" "}
						· {tooltip.visitors} active
					</span>
				</div>
			)}
		</div>
	);
}
