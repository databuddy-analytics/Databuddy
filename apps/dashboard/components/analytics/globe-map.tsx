"use client";

import { useTheme } from "next-themes";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/components/ui/dotmatrix/hooks";
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
	focusCode?: string | null;
	onHoverChange?: (code: string | null) => void;
}

interface Point {
	x: number;
	y: number;
	z: number;
}

interface Dot extends Point {
	country: number;
	sx: number;
	sy: number;
	visible: boolean;
}

interface LatLon {
	lat: number;
	lon: number;
}

const RAD = Math.PI / 180;
const DOT_SPACING = 1.5;
const SPHERE_SCALE = 0.45;
const SPIN_DEG_PER_SEC = 6;
const SPIN_FRAME_MS = 1000 / 80;
const MAX_DPR = 2;
const EMPTY_ALPHA = 0.16;
const ALPHA_LEVELS = 20;
const HOVER_RADIUS_PX = 10;
const TAP_SLOP_PX = 4;
const TOOLTIP_CLEARANCE_PX = 56;

function toUnit(lon: number, lat: number): Point {
	return {
		x: Math.cos(lat * RAD) * Math.sin(lon * RAD),
		y: Math.sin(lat * RAD),
		z: Math.cos(lat * RAD) * Math.cos(lon * RAD),
	};
}

function centerOf(points: Point[]): LatLon {
	let [x, y, z] = [0, 0, 0];
	for (const point of points) {
		x += point.x;
		y += point.y;
		z += point.z;
	}
	return {
		lat: Math.asin(y / Math.hypot(x, y, z)) / RAD,
		lon: Math.atan2(x, z) / RAD,
	};
}

function dotAt(country: number, lon: number, lat: number): Dot {
	return { country, sx: 0, sy: 0, visible: false, ...toUnit(lon, lat) };
}

function buildGlobe(geo: Country) {
	const features = geo.features.filter(
		(feature) => feature.properties.ISO_A2 !== "AQ"
	);
	const shapes = features.map(({ geometry }) =>
		(geometry.type === "MultiPolygon"
			? geometry.coordinates
			: [geometry.coordinates]
		).map((rings) => {
			const lats = rings[0].map(([, lat]) => lat);
			return {
				dots: [] as Dot[],
				north: Math.max(...lats),
				rings,
				south: Math.min(...lats),
			};
		})
	);

	for (let lat = -58 + DOT_SPACING / 2; lat < 84; lat += DOT_SPACING) {
		const count = Math.round((360 * Math.cos(lat * RAD)) / DOT_SPACING);
		const taken = new Uint8Array(count);
		for (const [country, polygons] of shapes.entries()) {
			for (const polygon of polygons) {
				if (lat < polygon.south || lat > polygon.north) {
					continue;
				}
				const crossings: number[] = [];
				for (const ring of polygon.rings) {
					let [xj, yj] = ring.at(-1) ?? [0, 0];
					for (const [xi, yi] of ring) {
						if (yi > lat !== yj > lat) {
							crossings.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
						}
						[xj, yj] = [xi, yi];
					}
				}
				crossings.sort((a, b) => a - b);
				for (let k = 1; k < crossings.length; k += 2) {
					const first = Math.ceil(
						((crossings[k - 1] + 180) * count) / 360 - 0.5
					);
					const end = Math.ceil(((crossings[k] + 180) * count) / 360 - 0.5);
					for (let i = Math.max(first, 0); i < Math.min(end, count); i++) {
						if (!taken[i]) {
							taken[i] = 1;
							polygon.dots.push(
								dotAt(country, -180 + ((i + 0.5) * 360) / count, lat)
							);
						}
					}
				}
			}
		}
	}

	const dots = shapes.flatMap((polygons) => polygons.flatMap((p) => p.dots));
	const countries = shapes.map((polygons, country) => {
		const main = polygons.reduce((a, b) =>
			b.dots.length > a.dots.length ? b : a
		);
		const center = centerOf(
			main.dots.length > 0
				? main.dots
				: main.rings[0].map(([lon, lat]) => toUnit(lon, lat))
		);
		if (main.dots.length === 0) {
			dots.push(dotAt(country, center.lon, center.lat));
		}
		return {
			center,
			code: featureCountryCode(features[country].properties),
			name: features[country].properties.ADMIN,
		};
	});

	return { countries, dots };
}

function viewOf(center: LatLon): LatLon {
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
	const reduceMotion = usePrefersReducedMotion();
	const { resolvedTheme } = useTheme();

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sceneRef = useRef({
		aimed: false,
		dirty: true,
		drag: null as null | (LatLon & { x: number; y: number }),
		hasTooltip: false,
		highlight: -1,
		inside: false,
		intensity: [] as number[],
		target: null as LatLon | null,
		view: { lat: 15, lon: 0 },
	});
	const wakeRef = useRef(() => {});
	const [tooltip, setTooltip] = useState<{
		index: number;
		x: number;
		y: number;
	} | null>(null);

	const valueByCode = useMemo(
		() => new Map(countries.map((c) => [c.code, c] as const)),
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
		const scene = sceneRef.current;
		scene.highlight = highlightCode
			? (indexByCode.get(highlightCode) ?? -1)
			: -1;
		scene.intensity = globe.countries.map((c) => {
			const value = valueByCode.get(c.code)?.value ?? 0;
			return value > 0 ? Math.sqrt(value / max) : -1;
		});
		scene.dirty = true;
		wakeRef.current();
	}, [globe, countries, valueByCode, indexByCode, highlightCode]);

	useEffect(() => {
		const scene = sceneRef.current;
		if (!globe || scene.aimed) {
			return;
		}
		const top = countries
			.filter((c) => indexByCode.has(c.code))
			.reduce<GlobeCountry | null>(
				(a, b) => (a && a.value >= b.value ? a : b),
				null
			);
		const center = top
			? globe.countries[indexByCode.get(top.code) ?? -1]?.center
			: undefined;
		if (center) {
			scene.view = viewOf(center);
			scene.aimed = true;
			scene.dirty = true;
			wakeRef.current();
		}
	}, [globe, countries, indexByCode]);

	useEffect(() => {
		const center = focusCode
			? globe?.countries[indexByCode.get(focusCode) ?? -1]?.center
			: undefined;
		sceneRef.current.target = center ? viewOf(center) : null;
		wakeRef.current();
	}, [globe, focusCode, indexByCode]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!(canvas && ctx && globe)) {
			return;
		}
		const scene = sceneRef.current;
		const style = getComputedStyle(canvas);
		let colors: { data: string; land: string } | null = null;
		const size = { dpr: 1, height: 0, width: 0 };

		const draw = () => {
			colors ??= {
				data: style.getPropertyValue("--globe-data"),
				land: style.getPropertyValue("--globe-land"),
			};
			const { width, height, dpr } = size;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);

			const radius = Math.min(width, height) * SPHERE_SCALE;
			const cx = width / 2;
			const cy = height / 2;
			const { lon, lat } = scene.view;
			const [cosL, sinL] = [Math.cos(lon * RAD), Math.sin(lon * RAD)];
			const [cosT, sinT] = [Math.cos(lat * RAD), Math.sin(lat * RAD)];
			const { highlight, intensity } = scene;
			const [land, data] = [0, 1].map(() =>
				Array.from({ length: ALPHA_LEVELS + 1 }, () => new Path2D())
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

				const layer = (t < 0 ? land : data)[Math.round(alpha * ALPHA_LEVELS)];
				layer.moveTo(dot.sx + r, dot.sy);
				layer.arc(dot.sx, dot.sy, r, 0, Math.PI * 2);
			}

			for (const [layers, color] of [
				[land, colors.land],
				[data, colors.data],
			] as const) {
				ctx.fillStyle = color;
				for (const [level, layer] of layers.entries()) {
					if (level > 0) {
						ctx.globalAlpha = level / ALPHA_LEVELS;
						ctx.fill(layer);
					}
				}
			}
			ctx.globalAlpha = 1;
		};

		let frame: number | null = null;
		let isOnScreen = false;
		let last = 0;
		let lastDraw = 0;
		const tick = (time: number) => {
			frame = null;
			const dt = last ? Math.min((time - last) / 1000, 0.1) : 0;
			last = time;
			const { view, target, drag } = scene;

			let isEasing = false;
			const isSpinning = !(
				target ||
				drag ||
				scene.inside ||
				scene.hasTooltip ||
				reduceMotion
			);
			if (target && !drag) {
				const ease = reduceMotion ? 1 : Math.min(1, dt * 6);
				const dLon = ((((target.lon - view.lon) % 360) + 540) % 360) - 180;
				isEasing = Math.abs(dLon) + Math.abs(target.lat - view.lat) > 0.01;
				if (isEasing) {
					view.lon += dLon * ease;
					view.lat += (target.lat - view.lat) * ease;
				}
			} else if (isSpinning) {
				view.lon -= SPIN_DEG_PER_SEC * dt;
			}

			const isMoving = isEasing || isSpinning;
			const isThrottled = isSpinning && time - lastDraw < SPIN_FRAME_MS;
			if ((isMoving || scene.dirty) && size.width > 0 && !isThrottled) {
				scene.dirty = false;
				lastDraw = time;
				draw();
			}
			if (isMoving || scene.dirty) {
				frame = requestAnimationFrame(tick);
			} else {
				last = 0;
			}
		};
		const wake = () => {
			if (isOnScreen) {
				frame ??= requestAnimationFrame(tick);
			}
		};
		wakeRef.current = wake;

		const resize = new ResizeObserver(([entry]) => {
			size.width = entry.contentRect.width;
			size.height = entry.contentRect.height;
			size.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
			canvas.width = Math.round(size.width * size.dpr);
			canvas.height = Math.round(size.height * size.dpr);
			draw();
		});
		const visibility = new IntersectionObserver(([entry]) => {
			isOnScreen = entry.isIntersecting;
			if (isOnScreen) {
				wake();
			} else if (frame !== null) {
				cancelAnimationFrame(frame);
				frame = null;
				last = 0;
			}
		});
		resize.observe(canvas);
		visibility.observe(canvas);

		return () => {
			isOnScreen = false;
			resize.disconnect();
			visibility.disconnect();
			if (frame !== null) {
				cancelAnimationFrame(frame);
			}
		};
	}, [globe, reduceMotion, resolvedTheme]);

	const setHover = (next: typeof tooltip) => {
		setTooltip(next);
		sceneRef.current.hasTooltip = next !== null;
		wakeRef.current();
		onHoverChange?.(next ? (globe?.countries[next.index]?.code ?? null) : null);
	};

	const pointerOffset = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const bounds = event.currentTarget.getBoundingClientRect();
		return {
			height: bounds.height,
			width: bounds.width,
			x: event.clientX - bounds.left,
			y: event.clientY - bounds.top,
		};
	};

	const hoverAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
		const { width, x, y } = pointerOffset(event);
		let nearest: Dot | null = null;
		let best = HOVER_RADIUS_PX ** 2;
		for (const dot of globe?.dots ?? []) {
			const distance = (dot.sx - x) ** 2 + (dot.sy - y) ** 2;
			if (dot.visible && distance < best) {
				best = distance;
				nearest = dot;
			}
		}
		setHover(nearest ? { index: nearest.country, x: x / width, y } : null);
	};

	const tooltipCountry = tooltip ? globe?.countries[tooltip.index] : undefined;
	const tooltipData = tooltipCountry
		? valueByCode.get(tooltipCountry.code)
		: undefined;

	return (
		<div className={cn("relative aspect-square w-full", className)}>
			<div
				aria-hidden
				className="absolute rounded-full bg-[radial-gradient(circle_at_34%_28%,var(--card)_28%,var(--muted)_62%,var(--accent-disabled))] ring-1 ring-border/60 dark:bg-[radial-gradient(circle_at_34%_28%,var(--muted),var(--card)_70%)]"
				style={{ inset: `${(0.5 - SPHERE_SCALE) * 100}%` }}
			/>
			<canvas
				aria-label="Globe of visitors by country"
				className="absolute inset-0 size-full cursor-grab touch-pan-y [--globe-data:var(--info)] [--globe-land:var(--info)] active:cursor-grabbing dark:[--globe-data:var(--chart-4)] dark:[--globe-land:var(--muted-foreground)]"
				onPointerCancel={() => {
					sceneRef.current.drag = null;
				}}
				onPointerDown={(event) => {
					if (event.button !== 0) {
						return;
					}
					event.currentTarget.setPointerCapture(event.pointerId);
					const { x, y } = pointerOffset(event);
					sceneRef.current.drag = { ...sceneRef.current.view, x, y };
					setHover(null);
				}}
				onPointerEnter={() => {
					sceneRef.current.inside = true;
				}}
				onPointerLeave={(event) => {
					sceneRef.current.inside = false;
					wakeRef.current();
					if (event.pointerType === "mouse") {
						setHover(null);
					}
				}}
				onPointerMove={(event) => {
					const scene = sceneRef.current;
					if (!scene.drag) {
						hoverAt(event);
						return;
					}
					if (event.buttons === 0) {
						scene.drag = null;
						return;
					}
					const { height, width, x, y } = pointerOffset(event);
					const radius = Math.min(width, height) * SPHERE_SCALE;
					scene.view = {
						lat: Math.max(
							-60,
							Math.min(60, scene.drag.lat + (y - scene.drag.y) / radius / RAD)
						),
						lon: scene.drag.lon - (x - scene.drag.x) / radius / RAD,
					};
					scene.dirty = true;
					wakeRef.current();
				}}
				onPointerUp={(event) => {
					const { drag } = sceneRef.current;
					sceneRef.current.drag = null;
					const { x, y } = pointerOffset(event);
					if (drag && Math.hypot(x - drag.x, y - drag.y) < TAP_SLOP_PX) {
						hoverAt(event);
					}
				}}
				ref={canvasRef}
				role="img"
			/>
			{tooltip && tooltipCountry && (
				<div
					className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm"
					style={{
						left: `${tooltip.x * 100}%`,
						top: tooltip.y,
						transform: `translate(${tooltip.x * -100}%, ${tooltip.y < TOOLTIP_CLEARANCE_PX ? "10px" : "calc(-100% - 10px)"})`,
					}}
				>
					<p className="font-medium text-foreground">
						{tooltipData?.name || tooltipCountry.name}
					</p>
					<p className="text-muted-foreground tabular-nums">
						{tooltipData
							? `${formatNumber(tooltipData.value)} ${tooltipData.value === 1 ? "visitor" : "visitors"}`
							: "No visitors"}
					</p>
				</div>
			)}
		</div>
	);
}
