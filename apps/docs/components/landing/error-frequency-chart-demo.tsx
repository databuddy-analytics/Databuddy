"use client";

import { useEffect, useId, useRef, useState } from "react";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const DEPLOY_X = 390;

// Orange line — total occurrences. Peaks early, stays elevated, drops sharply after deploy.
const ORANGE_LINE =
	"M 0 44" +
	" C 28 37,52 35,75 38" +
	" C 98 41,118 68,148 60" +
	" C 168 53,184 38,212 42" +
	" C 234 46,254 58,280 52" +
	" C 300 46,322 44,346 47" +
	" C 360 50,372 58,390 56" +
	" C 402 54,415 92,432 116" +
	" C 450 128,464 130,482 127" +
	" C 504 124,530 122,556 124" +
	" C 570 125,580 127,600 128";

// Red line — affected users. Always below orange. Near-zero after deploy.
const RED_LINE =
	"M 0 76" +
	" C 28 69,52 67,75 69" +
	" C 98 71,118 94,148 87" +
	" C 168 80,184 68,212 73" +
	" C 234 77,254 87,280 82" +
	" C 300 77,322 74,346 77" +
	" C 360 80,372 89,390 86" +
	" C 402 83,414 120,432 137" +
	" C 450 140,464 141,482 140" +
	" C 504 139,530 139,556 140" +
	" C 570 140,585 141,600 141";

const ORANGE_AREA = `${ORANGE_LINE} L 600 145 L 0 145 Z`;
const RED_AREA = `${RED_LINE} L 600 145 L 0 145 Z`;

export function ErrorFrequencyChartDemo() {
	const rawId = useId();
	const id = rawId.replace(/:/g, "");
	const ref = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry?.isIntersecting || el.dataset.animated === "true") return;
				el.dataset.animated = "true";
				setVisible(true);
			},
			{ threshold: 0.2, rootMargin: "0px 0px -60px 0px" }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div aria-hidden className="w-full" ref={ref}>
			{/* Chart */}
			<div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
				<div
					className="overflow-hidden"
					style={{
						maskImage:
							"linear-gradient(to bottom, black 80%, transparent 100%)",
						WebkitMaskImage:
							"linear-gradient(to bottom, black 80%, transparent 100%)",
					}}
				>
					<svg
						className="h-[140px] w-full sm:h-[160px]"
						preserveAspectRatio="none"
						viewBox="0 0 600 160"
					>
						<title>TypeError frequency over 7 days with deploy fix</title>
						<defs>
							{/* Vertical fill gradients */}
							<linearGradient id={`og-fill-${id}`} x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stopColor="rgba(234,179,8,0.18)" />
								<stop offset="100%" stopColor="rgba(234,179,8,0)" />
							</linearGradient>
							<linearGradient id={`rd-fill-${id}`} x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stopColor="rgba(239,68,68,0.13)" />
								<stop offset="100%" stopColor="rgba(239,68,68,0)" />
							</linearGradient>
							{/* Clip rect for left-to-right reveal of fills */}
							<clipPath id={`reveal-${id}`}>
								<rect
									height={160}
									style={{
										width: visible ? 600 : 0,
										transition: `width 1500ms ${EASE}`,
									}}
									x={0}
									y={0}
								/>
							</clipPath>
						</defs>

						{/* Area fills — clipped left-to-right */}
						<g clipPath={`url(#reveal-${id})`}>
							<path d={ORANGE_AREA} fill={`url(#og-fill-${id})`} />
							<path d={RED_AREA} fill={`url(#rd-fill-${id})`} />
						</g>

						{/* Orange stroke — total occurrences */}
						<path
							d={ORANGE_LINE}
							fill="none"
							pathLength={1}
							stroke="rgba(234,179,8,0.8)"
							strokeLinecap="round"
							strokeWidth="1.5"
							style={{
								strokeDasharray: 1,
								strokeDashoffset: visible ? 0 : 1,
								transition: `stroke-dashoffset 1500ms ${EASE}`,
								willChange: "stroke-dashoffset",
							}}
						/>

						{/* Red stroke — affected users */}
						<path
							d={RED_LINE}
							fill="none"
							pathLength={1}
							stroke="rgba(239,68,68,0.8)"
							strokeLinecap="round"
							strokeWidth="1.5"
							style={{
								strokeDasharray: 1,
								strokeDashoffset: visible ? 0 : 1,
								transition: `stroke-dashoffset 1500ms ${EASE}`,
								willChange: "stroke-dashoffset",
							}}
						/>

						{/* Deploy dashed vertical line */}
						<line
							opacity={visible ? 1 : 0}
							stroke="rgba(255,255,255,0.15)"
							strokeDasharray="4 4"
							strokeWidth="1"
							style={{
								transition: `opacity 400ms ${EASE}`,
								transitionDelay: visible ? "1000ms" : "0ms",
							}}
							x1={DEPLOY_X}
							x2={DEPLOY_X}
							y1={18}
							y2={145}
						/>

						{/* Deploy annotation label */}
						<text
							fill="rgba(148,163,184,0.5)"
							fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
							fontSize="9"
							opacity={visible ? 1 : 0}
							style={{
								transition: `opacity 400ms ${EASE}`,
								transitionDelay: visible ? "1000ms" : "0ms",
							}}
							textAnchor="middle"
							x={DEPLOY_X}
							y={12}
						>
							v1.2.5 deployed
						</text>
					</svg>
				</div>
				{/* Right fade */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-background/100 via-background/60 to-transparent"
				/>
			</div>

			{/* Stat labels */}
			<div
				className="mt-2 flex items-center justify-between"
				style={{
					opacity: visible ? 1 : 0,
					transition: `opacity 400ms ${EASE}`,
					transitionDelay: visible ? "1500ms" : "0ms",
				}}
			>
				<span className="font-mono text-xs">
					<span className="text-muted-foreground/50">
						159 → 3 users affected
					</span>
				</span>
				<span className="font-mono text-green-500/50 text-xs">
					−98% after deploy
				</span>
			</div>
		</div>
	);
}
