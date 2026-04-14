"use client";

import { type GeoPermissibleObjects, geoNaturalEarth1, geoPath } from "d3-geo";
import { useCallback, useEffect, useRef, useState } from "react";
import * as topojson from "topojson-client";
import worldTopo from "world-atlas/countries-110m.json";

// ---------------------------------------------------------------------------
// UptimeRegionsHubDiagram — animated D3 canvas world map with zone dithering
// ---------------------------------------------------------------------------
const ZONE_DEFS = [
	{ ids: new Set([840, 124, 484, 304]) },
	{ ids: new Set([826, 372, 250, 724, 620, 380, 56, 528, 300, 196]) },
	{
		ids: new Set([
			276, 208, 752, 578, 246, 40, 756, 616, 203, 348, 642, 100, 440, 428, 233,
			191,
		]),
	},
	{ ids: new Set([392, 410, 408, 704, 764, 360, 608, 458, 702]) },
	{ ids: new Set([356, 586, 50, 144, 524, 64]) },
	{ ids: new Set([76, 32, 152, 170, 604, 862, 68, 600, 858, 218, 328, 740]) },
];

const BAYER: number[][] = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
];

export function UptimeRegionsHubDiagram() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		let destroyed = false;

		async function init() {
			if (!(canvas && ctx) || destroyed) return;

			const logW = canvas.offsetWidth || 800;
			const logH = canvas.offsetHeight || 220;
			canvas.width = logW;
			canvas.height = logH;

			const rootStyle = getComputedStyle(document.documentElement);
			const BG = rootStyle.getPropertyValue("--background").trim() || "#19191D";
			const BORDER = rootStyle.getPropertyValue("--border").trim() || "#33333B";
			const FG = rootStyle.getPropertyValue("--foreground").trim() || "#E7E8EB";

			const projection = geoNaturalEarth1().fitExtent(
				[
					[-100, -50],
					[logW + 100, logH + 50],
				],
				{ type: "Sphere" } as GeoPermissibleObjects
			);

			if (destroyed) return;

			// biome-ignore lint/suspicious/noExplicitAny: topojson types
			const features = (
				topojson.feature(
					worldTopo as any,
					(worldTopo as any).objects.countries
				) as any
			).features;

			// Base map — drawn once onto an offscreen canvas
			const baseC = document.createElement("canvas");
			baseC.width = logW;
			baseC.height = logH;
			const bx = baseC.getContext("2d");
			if (!bx) return;
			const bPath = geoPath(projection, bx);
			bx.fillStyle = BG;
			bx.fillRect(0, 0, logW, logH);
			for (const f of features) {
				bx.beginPath();
				bPath(f);
				bx.fillStyle = BG;
				bx.fill();
				bx.strokeStyle = BORDER;
				bx.lineWidth = 0.3;
				bx.stroke();
			}

			// Pre-compute pixel lists per zone (at grid resolution G)
			const G = 3;
			const zones = ZONE_DEFS.map((def) => {
				const off = document.createElement("canvas");
				off.width = logW;
				off.height = logH;
				const ox = off.getContext("2d");
				if (!ox) return null;
				const oPath = geoPath(projection, ox);
				for (const f of features) {
					if (def.ids.has(+(f.id ?? -1))) {
						ox.beginPath();
						oPath(f);
						ox.fillStyle = "#fff";
						ox.fill();
					}
				}
				const data = ox.getImageData(0, 0, logW, logH).data;
				const pixels: number[] = [];
				for (let y = 0; y < logH; y += G)
					for (let x = 0; x < logW; x += G)
						if ((data[(y * logW + x) * 4] ?? 0) > 100) pixels.push(x, y);
				return {
					pixels,
					fill: FG,
					brightness: Math.random() * 0.6,
					rampUp: false,
				};
			}).filter(Boolean) as {
				pixels: number[];
				fill: string;
				brightness: number;
				rampUp: boolean;
			}[];

			// Sequential zone lighting — one at a time, cycling through the array
			let seqIndex = 0;
			const RAMP_MS = 700;
			const DECAY_MS = 1800;

			function fireNext() {
				if (destroyed) return;
				for (const z of zones) {
					z.brightness = 0;
					z.rampUp = false;
				}
				const zone = zones[seqIndex % zones.length];
				if (zone) {
					zone.brightness = 0;
					zone.rampUp = true;
				}
				seqIndex++;
				setTimeout(fireNext, RAMP_MS + 400 + DECAY_MS);
			}
			setTimeout(fireNext, 300);

			let last = performance.now();

			function draw(ts: number) {
				if (!ctx || destroyed) return;
				const dt = Math.min(ts - last, 50);
				last = ts;

				ctx.fillStyle = BG;
				ctx.fillRect(0, 0, logW, logH);
				ctx.drawImage(baseC, 0, 0);

				for (const zone of zones) {
					if (zone.rampUp) {
						zone.brightness = Math.min(1, zone.brightness + dt / 700);
						if (zone.brightness >= 1) zone.rampUp = false;
					} else {
						zone.brightness = Math.max(0, zone.brightness - dt / 1800);
					}
					if (zone.brightness <= 0) continue;

					ctx.fillStyle = zone.fill;
					for (let i = 0; i < zone.pixels.length; i += 2) {
						const x = zone.pixels[i];
						const y = zone.pixels[i + 1];
						const bayer =
							(BAYER[Math.floor(y / G) % 4]?.[Math.floor(x / G) % 4] ?? 0) / 16;
						if (zone.brightness > bayer) ctx.fillRect(x, y, 2, 2);
					}
				}

				rafRef.current = requestAnimationFrame(draw);
			}

			rafRef.current = requestAnimationFrame(draw);
		}

		init();

		return () => {
			destroyed = true;
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, []);

	return (
		<div className="relative w-full overflow-hidden rounded border border-white/[0.04]">
			<canvas className="block h-[220px] w-full" ref={canvasRef} />
		</div>
	);
}

// ---------------------------------------------------------------------------
// UptimeAlertsStackVisual — focus-aware carousel
// ---------------------------------------------------------------------------
const ROW_H = 62;
const GAP = 8;
const STRIDE = ROW_H + GAP;
const CYCLE_MS = 3200;
const DUR_MS = 700;
const ANIM_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const ALERT_ITEMS = [
	{
		kind: "down" as const,
		text: "api.acme.com returned 503",
		time: "14:32 UTC",
	},
	{
		kind: "warn" as const,
		text: "Response time > 2s on /api/checkout",
		time: "14:28 UTC",
	},
	{
		kind: "up" as const,
		text: "Uptime restored — 3 min total",
		time: "14:35 UTC",
	},
	{
		kind: "down" as const,
		text: "cdn.acme.com returned 503",
		time: "09:14 UTC",
	},
	{
		kind: "warn" as const,
		text: "Error rate spike on /api/auth",
		time: "11:47 UTC",
	},
	{
		kind: "up" as const,
		text: "cdn.acme.com — back online",
		time: "09:22 UTC",
	},
	{
		kind: "down" as const,
		text: "app.acme.com returned 503",
		time: "03:58 UTC",
	},
	{
		kind: "warn" as const,
		text: "P95 latency > 3s on /checkout",
		time: "16:01 UTC",
	},
	{
		kind: "up" as const,
		text: "app.acme.com — back online",
		time: "04:06 UTC",
	},
	{
		kind: "warn" as const,
		text: "SSL cert expires in 7 days",
		time: "08:00 UTC",
	},
];

const DOT: Record<"down" | "warn" | "up", string> = {
	down: "bg-red-400/90",
	warn: "bg-amber-400/90",
	up: "bg-green-400/90",
};

function rowStyles(pos: number): {
	opacity: number;
	filter: string;
	border: string;
	bg: string;
} {
	if (pos === 0)
		return {
			opacity: 1,
			filter: "none",
			border: "border-white/[0.18]",
			bg: "bg-white/[0.05]",
		};
	if (pos === 1)
		return {
			opacity: 0.42,
			filter: "blur(2px)",
			border: "border-white/[0.06]",
			bg: "bg-white/[0.02]",
		};
	if (pos === 2)
		return {
			opacity: 0.6,
			filter: "blur(2px)",
			border: "border-transparent",
			bg: "bg-transparent",
		};
	return {
		opacity: 0,
		filter: "none",
		border: "border-transparent",
		bg: "bg-transparent",
	};
}

export function UptimeAlertsStackVisual() {
	const [activeIdx, setActiveIdx] = useState(1);
	const [noTransition, setNoTransition] = useState(false);
	const busyRef = useRef(false);
	const activeRef = useRef(1);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const step = useCallback(() => {
		if (busyRef.current) return;
		busyRef.current = true;

		const next = activeRef.current + 1;

		if (next > ALERT_ITEMS.length - 2) {
			setNoTransition(true);
			activeRef.current = 1;
			setActiveIdx(1);
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					setNoTransition(false);
					busyRef.current = false;
				})
			);
			return;
		}

		activeRef.current = next;
		setActiveIdx(next);
		setTimeout(() => {
			busyRef.current = false;
		}, DUR_MS + 20);
	}, []);

	useEffect(() => {
		const sched = () => {
			timerRef.current = setTimeout(() => {
				step();
				sched();
			}, CYCLE_MS);
		};
		sched();
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [step]);

	const translateY = -(activeIdx - 1) * STRIDE;

	return (
		<div
			className="relative overflow-hidden rounded border border-white/[0.04]"
			style={{ height: 3 * ROW_H + 2 * GAP }}
		>
			<div
				className="flex flex-col"
				style={{
					gap: GAP,
					transform: `translateY(${translateY}px)`,
					transition: noTransition
						? "none"
						: `transform ${DUR_MS}ms ${ANIM_EASE}`,
				}}
			>
				{ALERT_ITEMS.map((row, i) => {
					const pos = Math.abs(i - activeIdx);
					const s = rowStyles(pos);
					return (
						<div
							className={`flex items-center justify-between gap-4 rounded border px-3 font-mono text-muted-foreground text-sm ${s.border} ${s.bg}`}
							// biome-ignore lint/suspicious/noArrayIndexKey: static list
							key={i}
							style={{
								minHeight: ROW_H,
								opacity: s.opacity,
								filter: s.filter,
								transition: `opacity ${DUR_MS}ms ease, filter ${DUR_MS}ms ease`,
							}}
						>
							<span className="flex min-w-0 flex-1 items-center gap-2 truncate">
								<span
									className={`size-2 shrink-0 rounded-full ${DOT[row.kind]}`}
								/>
								{row.text}
							</span>
							<span className="shrink-0 text-xs tabular-nums opacity-70">
								{row.time}
							</span>
						</div>
					);
				})}
			</div>

			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8"
				style={{
					background:
						"linear-gradient(to bottom, hsl(var(--background)), transparent)",
				}}
			/>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8"
				style={{
					background:
						"linear-gradient(to top, hsl(var(--background)), transparent)",
				}}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// UptimeStatusPageMiniVisual
// ---------------------------------------------------------------------------
const DEMO_MONITORS = [
	{
		name: "Dashboard",
		domain: "app.acme.com",
		uptime: "99.95",
		seed: 77,
		incidents: [{ start: 58, end: 59, color: "bg-red-500" }],
	},
	{
		name: "API",
		domain: "api.acme.com",
		uptime: "99.98",
		seed: 42,
		incidents: [
			{ start: 31, end: 32, color: "bg-red-500" },
			{ start: 33, end: 33, color: "bg-amber-400" },
		],
	},
	{
		name: "Marketing Site",
		domain: "acme.com",
		uptime: "100.00",
		seed: 13,
		incidents: [],
	},
] as const;

function seededColor(index: number, seed: number): string {
	const hash = Math.abs(((index + 1) * 31 + seed * 17) % 1000);
	if (hash < 10) return "bg-amber-400";
	return "bg-emerald-500";
}

function DemoHeatmapStrip({
	seed,
	incidents,
}: {
	seed: number;
	incidents: ReadonlyArray<{ start: number; end: number; color: string }>;
}) {
	return (
		<div className="flex gap-px">
			{Array.from({ length: 90 }, (_, i) => {
				const incident = incidents.find(
					(inc) => i >= inc.start && i <= inc.end
				);
				const color = incident ? incident.color : seededColor(i, seed);
				return <div className={`h-7 flex-1 rounded-sm ${color}`} key={i} />;
			})}
		</div>
	);
}

export function UptimeStatusPageMiniVisual() {
	return (
		<div className="relative max-h-[260px] overflow-hidden rounded bg-card/30 backdrop-blur-sm">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 z-10 rounded border border-border/50 [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_100%)]"
			/>
			<div className="border-border border-b px-5 py-4">
				<div className="flex items-center justify-between">
					<span className="font-semibold text-foreground text-sm">Status</span>
					<div className="flex items-center gap-2">
						<span className="relative flex size-2">
							<span className="absolute inline-flex size-full animate-ping rounded bg-emerald-400 opacity-75" />
							<span className="relative inline-flex size-2 rounded bg-emerald-500" />
						</span>
						<span className="font-medium text-emerald-500 text-xs">
							All Systems Operational
						</span>
					</div>
				</div>
			</div>

			<div className="space-y-4 p-5">
				{DEMO_MONITORS.map((monitor) => (
					<div key={monitor.name}>
						<div className="mb-2 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="size-1.5 rounded bg-emerald-500" />
								<span className="font-medium text-foreground text-xs">
									{monitor.name}
								</span>
								<span className="text-muted-foreground text-xs">
									{monitor.domain}
								</span>
							</div>
							<span className="font-medium text-foreground text-xs tabular-nums">
								{monitor.uptime}%
							</span>
						</div>
						<DemoHeatmapStrip
							incidents={monitor.incidents}
							seed={monitor.seed}
						/>
					</div>
				))}
			</div>

			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-background/100 via-background/80 to-transparent"
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// UptimeIncidentTimelineVisual
// ---------------------------------------------------------------------------
const TIMELINE = [
	{ time: "14:32", label: "Downtime detected", tone: "red" as const },
	{ time: "14:33", label: "Team alerted via Slack", tone: "amber" as const },
	{ time: "14:35", label: "Service recovered", tone: "green" as const },
] as const;

export function UptimeIncidentTimelineVisual() {
	return (
		<div className="space-y-0">
			{TIMELINE.map((ev, i) => (
				<div className="flex gap-3" key={ev.time}>
					<div className="flex w-5 shrink-0 flex-col items-center pt-0.5">
						<span
							aria-hidden
							className={`size-2 rounded-full ${
								ev.tone === "red"
									? "bg-red-500/80"
									: ev.tone === "amber"
										? "bg-amber-500/80"
										: "bg-green-500/80"
							}`}
						/>
						{i < TIMELINE.length - 1 ? (
							<span
								aria-hidden
								className="mt-1 min-h-[5rem] w-px grow bg-white/15"
							/>
						) : null}
					</div>
					<div
						className={`min-w-0 flex-1 font-mono text-muted-foreground text-sm ${
							i < TIMELINE.length - 1 ? "pb-4" : ""
						}`}
					>
						<div className="text-[10px] tabular-nums opacity-80">{ev.time}</div>
						<div>{ev.label}</div>
					</div>
				</div>
			))}
		</div>
	);
}
