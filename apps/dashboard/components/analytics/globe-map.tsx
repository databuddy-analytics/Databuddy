"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "@/lib/formatters";
import { type Country, featureCountryCode, useCountries } from "@/lib/geo";
import { cn } from "@/lib/utils";

export interface GlobeCountry {
	code: string;
	name: string;
	value: number;
}

interface GlobeMapProps {
	className?: string;
	countries: GlobeCountry[];
	/** Rotates the globe to face this country and highlights it. */
	focusCode?: string | null;
	onHoverChange?: (code: string | null) => void;
}

interface Dot {
	country: number;
	sx: number;
	sy: number;
	visible: boolean;
	x: number;
	y: number;
	z: number;
}

interface LandCountry {
	center: { lat: number; lon: number };
	code: string;
	name: string;
}

type Ring = number[][];

const RAD = Math.PI / 180;
/** Angular distance between dots, in degrees. */
const DOT_SPACING = 1.5;
/** Sphere radius as a share of the canvas size; the CSS sphere uses the same inset. */
const SPHERE_SCALE = 0.45;
const SPIN_DEG_PER_SEC = 6;
const EMPTY_ALPHA = 0.16;
const ALPHA_LEVELS = 20;
const HOVER_RADIUS_PX = 10;

function polygonsOf(geometry: {
	coordinates: unknown;
	type: string;
}): Ring[][] {
	return geometry.type === "MultiPolygon"
		? (geometry.coordinates as Ring[][])
		: [geometry.coordinates as Ring[]];
}

// Even-odd ray cast in lon/lat space, holes included. Planar is fine at
// Natural Earth 1:110m, which already splits shapes at the antimeridian.
function inPolygon(rings: Ring[], lon: number, lat: number): boolean {
	let inside = false;
	for (const ring of rings) {
		let prev = ring.at(-1);
		for (const point of ring) {
			const [xi = 0, yi = 0] = point;
			const [xj = 0, yj = 0] = prev ?? point;
			if (
				yi > lat !== yj > lat &&
				lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
			) {
				inside = !inside;
			}
			prev = point;
		}
	}
	return inside;
}

function toUnit(lon: number, lat: number) {
	return {
		x: Math.cos(lat * RAD) * Math.sin(lon * RAD),
		y: Math.sin(lat * RAD),
		z: Math.cos(lat * RAD) * Math.cos(lon * RAD),
	};
}

/** Samples the land as evenly spaced dots on the sphere, each tagged with its country. */
function buildGlobe(geo: Country): { countries: LandCountry[]; dots: Dot[] } {
	const shapes = geo.features
		.filter((feature) => feature.properties.ISO_A2 !== "AQ")
		.map((feature) => {
			const polygons = polygonsOf(feature.geometry);
			let [west, south, east, north] = [180, 90, -180, -90];
			for (const polygon of polygons) {
				for (const [lon = 0, lat = 0] of polygon[0] ?? []) {
					west = Math.min(west, lon);
					east = Math.max(east, lon);
					south = Math.min(south, lat);
					north = Math.max(north, lat);
				}
			}
			return { east, feature, north, polygons, south, west };
		});

	const dots: Dot[] = [];
	const addDot = (country: number, lon: number, lat: number) =>
		dots.push({ country, sx: 0, sy: 0, visible: false, ...toUnit(lon, lat) });

	for (let lat = -58 + DOT_SPACING / 2; lat < 84; lat += DOT_SPACING) {
		const count = Math.round((360 * Math.cos(lat * RAD)) / DOT_SPACING);
		for (let i = 0; i < count; i++) {
			const lon = -180 + ((i + 0.5) * 360) / count;
			const country = shapes.findIndex(
				(s) =>
					lon >= s.west &&
					lon <= s.east &&
					lat >= s.south &&
					lat <= s.north &&
					s.polygons.some((polygon) => inPolygon(polygon, lon, lat))
			);
			if (country !== -1) {
				addDot(country, lon, lat);
			}
		}
	}

	const sums = shapes.map(() => ({ n: 0, x: 0, y: 0, z: 0 }));
	for (const dot of dots) {
		const sum = sums[dot.country];
		if (sum) {
			sum.n += 1;
			sum.x += dot.x;
			sum.y += dot.y;
			sum.z += dot.z;
		}
	}

	const countries = shapes.map((shape, index) => {
		const sum = sums[index];
		let center = {
			lat: (shape.south + shape.north) / 2,
			lon: (shape.west + shape.east) / 2,
		};
		if (sum && sum.n > 0) {
			const length = Math.hypot(sum.x, sum.y, sum.z);
			center = {
				lat: Math.asin(sum.y / length) / RAD,
				lon: Math.atan2(sum.x, sum.z) / RAD,
			};
		} else {
			// Too small for the grid; one dot keeps it visible.
			addDot(index, center.lon, center.lat);
		}
		return {
			center,
			code: featureCountryCode(shape.feature.properties),
			name: shape.feature.properties.ADMIN,
		};
	});

	return { countries, dots };
}

/** Where the camera looks when facing a country; tilt is capped so the poles stay tidy. */
function viewOf(center: { lat: number; lon: number }) {
	return { lat: Math.max(-20, Math.min(20, center.lat)), lon: center.lon };
}

export function GlobeMap({
	className,
	countries,
	focusCode = null,
	onHoverChange,
}: GlobeMapProps) {
	const { data: geo } = useCountries();
	const globe = useMemo(() => (geo ? buildGlobe(geo) : null), [geo]);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const viewRef = useRef({ lat: 15, lon: 0 });
	const targetRef = useRef<{ lat: number; lon: number } | null>(null);
	const styleRef = useRef({ highlight: -1, intensity: [] as number[] });
	const dirtyRef = useRef(true);
	const aimedRef = useRef(false);
	const pointerRef = useRef({
		inside: false,
		drag: null as null | { lat: number; lon: number; x: number; y: number },
	});
	const hoverRef = useRef<string | null>(null);
	const [tooltip, setTooltip] = useState<{
		index: number;
		x: number;
		y: number;
	} | null>(null);

	const valueByCode = useMemo(
		() => new Map(countries.map((c) => [c.code.toUpperCase(), c] as const)),
		[countries]
	);

	const indexByCode = useMemo(
		() => new Map(globe?.countries.map((c, index) => [c.code, index] as const)),
		[globe]
	);

	const hoverCode = tooltip
		? (globe?.countries[tooltip.index]?.code ?? null)
		: null;
	const highlightCode = hoverCode ?? focusCode;

	useEffect(() => {
		if (!globe) {
			return;
		}
		const max = Math.max(0, ...countries.map((c) => c.value));
		styleRef.current = {
			highlight: highlightCode ? (indexByCode.get(highlightCode) ?? -1) : -1,
			intensity: globe.countries.map((c) => {
				const value = valueByCode.get(c.code)?.value ?? 0;
				return value > 0 && max > 0 ? Math.sqrt(value / max) : -1;
			}),
		};
		dirtyRef.current = true;
	}, [globe, countries, valueByCode, indexByCode, highlightCode]);

	useEffect(() => {
		if (!globe || aimedRef.current || countries.length === 0) {
			return;
		}
		const top = countries.reduce((a, b) => (b.value > a.value ? b : a));
		const center =
			globe.countries[indexByCode.get(top.code.toUpperCase()) ?? -1]?.center;
		if (center) {
			viewRef.current = viewOf(center);
			aimedRef.current = true;
			dirtyRef.current = true;
		}
	}, [globe, countries, indexByCode]);

	useEffect(() => {
		const center = focusCode
			? globe?.countries[indexByCode.get(focusCode) ?? -1]?.center
			: undefined;
		targetRef.current = center ? viewOf(center) : null;
	}, [globe, focusCode, indexByCode]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!(canvas && ctx && globe)) {
			return;
		}
		const color = getComputedStyle(canvas).getPropertyValue("--info");
		const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
		const size = { dpr: 1, height: 0, width: 0 };

		const draw = () => {
			const { width, height, dpr } = size;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);

			const radius = Math.min(width, height) * SPHERE_SCALE;
			const cx = width / 2;
			const cy = height / 2;
			const { lon, lat } = viewRef.current;
			const [cosL, sinL] = [Math.cos(lon * RAD), Math.sin(lon * RAD)];
			const [cosT, sinT] = [Math.cos(lat * RAD), Math.sin(lat * RAD)];
			const { highlight, intensity } = styleRef.current;
			// One path per opacity step keeps it to a handful of fills per frame.
			const layers = Array.from(
				{ length: ALPHA_LEVELS + 1 },
				() => new Path2D()
			);

			for (const dot of globe.dots) {
				const x = dot.x * cosL - dot.z * sinL;
				const z1 = dot.z * cosL + dot.x * sinL;
				const y = dot.y * cosT - z1 * sinT;
				const depth = dot.y * sinT + z1 * cosT;
				dot.visible = depth > 0;
				if (!dot.visible) {
					continue;
				}
				dot.sx = cx + radius * x;
				dot.sy = cy - radius * y;

				const t = intensity[dot.country] ?? -1;
				let alpha = t < 0 ? EMPTY_ALPHA : 0.35 + 0.65 * t;
				if (highlight !== -1) {
					alpha = dot.country === highlight ? 1 : alpha * 0.45;
				}
				alpha *= Math.min(1, depth / 0.35);
				const r =
					radius * (t < 0 ? 0.0065 : 0.007 + 0.003 * t) * (0.55 + 0.45 * depth);

				const layer = layers[Math.round(alpha * ALPHA_LEVELS)];
				layer?.moveTo(dot.sx + r, dot.sy);
				layer?.arc(dot.sx, dot.sy, r, 0, Math.PI * 2);
			}

			ctx.fillStyle = color;
			for (const [level, layer] of layers.entries()) {
				if (level > 0) {
					ctx.globalAlpha = level / ALPHA_LEVELS;
					ctx.fill(layer);
				}
			}
			ctx.globalAlpha = 1;
		};

		let frame: number | null = null;
		let last = 0;
		const tick = (time: number) => {
			const dt = last ? Math.min((time - last) / 1000, 0.1) : 0;
			last = time;
			const view = viewRef.current;
			const target = targetRef.current;
			const { inside, drag } = pointerRef.current;

			if (target && !drag) {
				const ease = reduceMotion ? 1 : Math.min(1, dt * 6);
				const dLon = ((((target.lon - view.lon) % 360) + 540) % 360) - 180;
				if (Math.abs(dLon) + Math.abs(target.lat - view.lat) > 0.01) {
					view.lon += dLon * ease;
					view.lat += (target.lat - view.lat) * ease;
					dirtyRef.current = true;
				}
			} else if (!(inside || reduceMotion)) {
				view.lon -= SPIN_DEG_PER_SEC * dt;
				dirtyRef.current = true;
			}

			if (dirtyRef.current && size.width > 0) {
				dirtyRef.current = false;
				draw();
			}
			frame = requestAnimationFrame(tick);
		};
		const start = () => {
			frame ??= requestAnimationFrame(tick);
		};
		const stop = () => {
			if (frame !== null) {
				cancelAnimationFrame(frame);
			}
			frame = null;
			last = 0;
		};

		const resize = new ResizeObserver(([entry]) => {
			if (!entry) {
				return;
			}
			size.width = entry.contentRect.width;
			size.height = entry.contentRect.height;
			size.dpr = window.devicePixelRatio || 1;
			canvas.width = Math.round(size.width * size.dpr);
			canvas.height = Math.round(size.height * size.dpr);
			dirtyRef.current = true;
		});
		const visibility = new IntersectionObserver(([entry]) => {
			if (entry?.isIntersecting) {
				start();
			} else {
				stop();
			}
		});
		resize.observe(canvas);
		visibility.observe(canvas);

		return () => {
			resize.disconnect();
			visibility.disconnect();
			stop();
		};
	}, [globe]);

	const setHover = (next: { index: number; x: number; y: number } | null) => {
		setTooltip(next);
		const code = next ? (globe?.countries[next.index]?.code ?? null) : null;
		if (code !== hoverRef.current) {
			hoverRef.current = code;
			onHoverChange?.(code);
		}
	};

	const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - bounds.left;
		const y = event.clientY - bounds.top;
		const { drag } = pointerRef.current;

		if (drag) {
			const radius = Math.min(bounds.width, bounds.height) * SPHERE_SCALE;
			viewRef.current = {
				lat: Math.max(
					-60,
					Math.min(60, drag.lat + (y - drag.y) / radius / RAD)
				),
				lon: drag.lon - (x - drag.x) / radius / RAD,
			};
			dirtyRef.current = true;
			return;
		}

		let nearest: Dot | null = null;
		let best = HOVER_RADIUS_PX ** 2;
		for (const dot of globe?.dots ?? []) {
			const distance = (dot.sx - x) ** 2 + (dot.sy - y) ** 2;
			if (dot.visible && distance < best) {
				best = distance;
				nearest = dot;
			}
		}
		setHover(nearest ? { index: nearest.country, x, y } : null);
	};

	const tooltipCountry = tooltip ? globe?.countries[tooltip.index] : undefined;
	const tooltipData = tooltipCountry
		? valueByCode.get(tooltipCountry.code)
		: undefined;

	return (
		<div className={cn("relative aspect-square w-full", className)}>
			<div
				aria-hidden
				className="absolute inset-[5%] rounded-full ring-1 ring-border/60"
				style={{
					background:
						"radial-gradient(circle at 34% 28%, var(--card) 28%, var(--muted) 62%, var(--accent-disabled) 100%)",
				}}
			/>
			<canvas
				aria-label="Globe of visitors by country"
				className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
				onPointerCancel={() => {
					pointerRef.current.drag = null;
				}}
				onPointerDown={(event) => {
					const bounds = event.currentTarget.getBoundingClientRect();
					event.currentTarget.setPointerCapture(event.pointerId);
					pointerRef.current.drag = {
						...viewRef.current,
						x: event.clientX - bounds.left,
						y: event.clientY - bounds.top,
					};
					setHover(null);
				}}
				onPointerEnter={() => {
					pointerRef.current.inside = true;
				}}
				onPointerLeave={() => {
					pointerRef.current.inside = false;
					setHover(null);
				}}
				onPointerMove={handlePointerMove}
				onPointerUp={() => {
					pointerRef.current.drag = null;
				}}
				ref={canvasRef}
				role="img"
			/>
			{tooltip && tooltipCountry && (
				<div
					className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
					style={{ left: tooltip.x, top: tooltip.y - 10 }}
				>
					<p className="font-medium text-foreground">
						{tooltipData?.name || tooltipCountry.name}
					</p>
					<p className="text-muted-foreground tabular-nums">
						{tooltipData
							? `${formatNumber(tooltipData.value)} visitors`
							: "No visitors"}
					</p>
				</div>
			)}
		</div>
	);
}
