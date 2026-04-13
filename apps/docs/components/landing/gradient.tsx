"use client";

import { useEffect, useId, useRef } from "react";

function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace("#", "");
	const r = Number.parseInt(h.slice(0, 2), 16);
	const g = Number.parseInt(h.slice(2, 4), 16);
	const b = Number.parseInt(h.slice(4, 6), 16);
	if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b))
		return `rgba(0,0,0,${alpha})`;
	return `rgba(${r},${g},${b},${alpha})`;
}

function readVar(name: string, fallback: string) {
	if (typeof document === "undefined") {
		return fallback;
	}
	const v = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	return v || fallback;
}

type Point = { x: number; y: number };

/** Cubic Bézier — two handles give a visible S / arc (quadratic with near-collinear control looks straight). */
function cubicBezier(
	p0: Point,
	p1: Point,
	p2: Point,
	p3: Point,
	t: number
): Point {
	const u = 1 - t;
	const uu = u * u;
	const tt = t * t;
	return {
		x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
		y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
	};
}

function cubicTangent(
	p0: Point,
	p1: Point,
	p2: Point,
	p3: Point,
	t: number
): Point {
	const u = 1 - t;
	const uu = u * u;
	const tt = t * t;
	return {
		x:
			3 * uu * (p1.x - p0.x) +
			6 * u * t * (p2.x - p1.x) +
			3 * tt * (p3.x - p2.x),
		y:
			3 * uu * (p1.y - p0.y) +
			6 * u * t * (p2.y - p1.y) +
			3 * tt * (p3.y - p2.y),
	};
}

function hypot(v: Point) {
	return Math.hypot(v.x, v.y);
}

function norm(v: Point): Point {
	const L = hypot(v);
	if (L < 1e-9) {
		return { x: 0, y: 1 };
	}
	return { x: v.x / L, y: v.y / L };
}

/** Perpendicular (CCW 90°) to tangent — gradient runs across stroke width */
function normalFromTangent(tan: Point): Point {
	return norm({ x: -tan.y, y: tan.x });
}

const STRIP_STEPS = 135;

/** Broad S-swoop BL → TR (cubic path + strip quads); colors are set in the draw loop only. */
export function Gradient() {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rawId = useId();
	const noiseFilterId = `grain-${rawId.replace(/:/g, "")}`;

	useEffect(() => {
		const container = containerRef.current;
		const canvas = canvasRef.current;
		if (!(container && canvas)) {
			return;
		}

		const draw = () => {
			const w = container.clientWidth;
			const h = container.clientHeight;
			if (w < 1 || h < 1) {
				return;
			}

			const dpr = Math.min(
				typeof window === "undefined" ? 1 : window.devicePixelRatio,
				2
			);
			canvas.width = Math.floor(w * dpr);
			canvas.height = Math.floor(h * dpr);
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;

			const ctx = canvas.getContext("2d", { alpha: true });
			if (!ctx) {
				return;
			}

			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.scale(dpr, dpr);
			ctx.clearRect(0, 0, w, h);

			const bg = readVar("--background", "#19191D");
			const bgTransparent = hexToRgba(bg, 0);
			const amber = readVar("--brand-amber", "#E3A514");
			const orange = readVar("--brand-orange", "#D66736");
			const coral = readVar("--brand-coral", "#B74677");
			const purple = readVar("--brand-purple", "#453C7C");
			const blue = readVar("--brand-blue", "#152E7F");

			/*
			 * Softer flowing S: handles inset from the viewport edges so the arc bends
			 * gradually (less “railroad” than P1 on y≈h and P2 on x≈w).
			 * p2 sets the incoming tangent at p3 (top-right): lower x / higher y = sharper
			 * final hook into the corner (vector p3 − p2 is longer and more “up”).
			 */
			const p0: Point = { x: 0, y: h * 0.9 };
			const p1: Point = { x: w * 0.55, y: h * 0.32 };
			const p2: Point = { x: w * 0.82, y: h * 0.9 };
			const p3: Point = { x: w * 0.89, y: 0 };

			/* t=0 at BL (thick) → t=1 at TR (thin): band width tapers along the swoop */
			const m = Math.min(w, h);
			const thickBL = Math.max(56, m * 0.28);
			const thinTR = Math.max(22, m * 0.09);
			const halfWAt = (t: number) => thickBL * (1 - t) + thinTR * t;

			for (let i = 0; i < STRIP_STEPS; i++) {
				const t0 = i / STRIP_STEPS;
				const t1 = (i + 1) / STRIP_STEPS;
				const w0 = halfWAt(t0);
				const w1 = halfWAt(t1);
				const wMid = (w0 + w1) / 2;

				const pa = cubicBezier(p0, p1, p2, p3, t0);
				const pb = cubicBezier(p0, p1, p2, p3, t1);
				const ta = cubicTangent(p0, p1, p2, p3, t0);
				const tb = cubicTangent(p0, p1, p2, p3, t1);
				const na = normalFromTangent(ta);
				const nb = normalFromTangent(tb);

				const mid: Point = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
				const navg = norm({ x: na.x + nb.x, y: na.y + nb.y });

				const g = ctx.createLinearGradient(
					mid.x - wMid * navg.x,
					mid.y - wMid * navg.y,
					mid.x + wMid * navg.x,
					mid.y + wMid * navg.y
				);
				g.addColorStop(0, bgTransparent);
				g.addColorStop(0.04, amber);
				g.addColorStop(0.22, orange);
				g.addColorStop(0.4, coral);
				g.addColorStop(0.62, purple);
				g.addColorStop(0.82, blue);
				g.addColorStop(0.96, bg);
				g.addColorStop(1, bgTransparent);

				ctx.beginPath();
				ctx.moveTo(pa.x - w0 * na.x, pa.y - w0 * na.y);
				ctx.lineTo(pa.x + w0 * na.x, pa.y + w0 * na.y);
				ctx.lineTo(pb.x + w1 * nb.x, pb.y + w1 * nb.y);
				ctx.lineTo(pb.x - w1 * nb.x, pb.y - w1 * nb.y);
				ctx.closePath();
				ctx.fillStyle = g;
				ctx.globalAlpha = 1;
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		};

		const ro = new ResizeObserver(draw);
		ro.observe(container);
		draw();

		return () => {
			ro.disconnect();
		};
	}, []);

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden"
			ref={containerRef}
		>
			<div className="absolute inset-0 bg-background" />

			<div className="absolute inset-0 origin-center scale-[1.2]">
				<canvas
					className="block size-full blur-[10px] sm:blur-[16px]"
					ref={canvasRef}
				/>
			</div>

			<svg
				aria-hidden
				className="pointer-events-none absolute inset-0 size-full opacity-[0.06]"
			>
				<title>Grain</title>
				<defs>
					<filter colorInterpolationFilters="sRGB" id={noiseFilterId}>
						<feTurbulence
							baseFrequency="0.85"
							numOctaves="3"
							stitchTiles="stitch"
							type="fractalNoise"
						/>
					</filter>
				</defs>
				<rect
					className="size-full"
					filter={`url(#${noiseFilterId})`}
					height="100%"
					width="100%"
				/>
			</svg>

			<div
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(to bottom, transparent 0%, transparent 34%, var(--background) 100%)",
				}}
			/>
		</div>
	);
}
