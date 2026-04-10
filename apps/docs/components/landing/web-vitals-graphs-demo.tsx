"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const STATUS_STROKE = {
	good: "stroke-green-400",
	"needs-improvement": "stroke-amber-400",
	poor: "stroke-red-400",
} as const;

/** Ring fill (0–100) and display values aligned with the marketing gauge reference. */
const GAUGES = [
	{
		label: "LCP",
		value: "1.6s",
		score: 80,
		status: "good" as const,
	},
	{
		label: "CLS",
		value: "0.00",
		score: 100,
		status: "good" as const,
	},
	{
		label: "INP",
		value: "88ms",
		score: 75,
		status: "good" as const,
	},
	{
		label: "FCP",
		value: "1.7s",
		score: 85,
		status: "good" as const,
	},
	{
		label: "TTFB",
		value: "820ms",
		score: 90,
		status: "needs-improvement" as const,
	},
] as const;

const SW = "1.4";

function VitalGauge({
	label,
	value,
	score,
	status,
	index,
	inView,
	reduceMotion,
}: {
	label: string;
	value: string;
	score: number;
	status: "good" | "needs-improvement" | "poor";
	index: number;
	inView: boolean;
	reduceMotion: boolean;
}) {
	const targetOffset = 100 - score;
	const duration = reduceMotion ? 0 : 0.85;
	const delay = reduceMotion ? 0 : 0.04 + index * 0.07;

	return (
		<div className="flex min-w-0 flex-col items-center gap-2">
			<div className="relative flex size-14 shrink-0 items-center justify-center sm:size-16">
				<svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
					<title>{`${label} ${value}`}</title>
					<circle
						cx="18"
						cy="18"
						fill="none"
						r="16"
						stroke="rgba(255,255,255,0.08)"
						strokeWidth={SW}
					/>
					{reduceMotion ? (
						<circle
							className={cn(STATUS_STROKE[status])}
							cx="18"
							cy="18"
							fill="none"
							pathLength={100}
							r="16"
							strokeDasharray="100"
							strokeDashoffset={targetOffset}
							strokeLinecap="round"
							strokeWidth={SW}
						/>
					) : (
						<motion.circle
							animate={
								inView
									? { strokeDashoffset: targetOffset }
									: { strokeDashoffset: 100 }
							}
							className={cn(STATUS_STROKE[status])}
							cx="18"
							cy="18"
							fill="none"
							initial={{ strokeDashoffset: 100 }}
							pathLength={100}
							r="16"
							strokeDasharray="100"
							strokeLinecap="round"
							strokeWidth={SW}
							transition={{
								duration,
								delay,
								ease: [0.22, 1, 0.36, 1],
							}}
						/>
					)}
				</svg>
				<span className="absolute max-w-[92%] px-1 text-center font-medium font-mono text-foreground text-xs tabular-nums leading-tight sm:text-sm">
					{value}
				</span>
			</div>
			<span className="w-full text-center font-mono text-[10px] text-muted-foreground uppercase tracking-wide sm:text-[11px]">
				{label}
			</span>
		</div>
	);
}

export function WebVitalsGraphsDemo() {
	const containerRef = useRef<HTMLDivElement>(null);
	const inView = useInView(containerRef, { amount: 0.35, once: true });
	const reduceMotion = useReducedMotion() ?? false;

	return (
		<div
			aria-label="Core Web Vitals gauge preview"
			className="relative w-full overflow-hidden"
			ref={containerRef}
			role="img"
		>
			<div className="w-full overflow-hidden rounded border border-white/[0.06]">
				<div className="flex items-center justify-between gap-3 border-white/[0.06] border-b px-3.5 py-2.5">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate font-medium text-muted-foreground text-xs">
							Core Web Vitals
						</span>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<span className="rounded border border-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
							Last 28 days
						</span>
					</div>
				</div>

				<div className="px-4 py-5">
					<div className="grid grid-cols-5 items-center justify-items-center gap-2">
						{GAUGES.map((g, index) => (
							<VitalGauge
								index={index}
								inView={inView}
								key={g.label}
								label={g.label}
								reduceMotion={reduceMotion}
								score={g.score}
								status={g.status}
								value={g.value}
							/>
						))}
					</div>
				</div>

				<div className="grid grid-cols-4 border-white/[0.06] border-t">
					<div className="flex items-center justify-between gap-2 px-3 py-2">
						<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
							Origin
						</span>
						<span className="font-medium font-mono text-green-500 text-xs">
							Passing
						</span>
					</div>
					<div className="flex items-center justify-between gap-2 border-white/[0.06] border-l px-3 py-2">
						<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
							p75 LCP
						</span>
						<span className="font-medium font-mono text-green-500 text-xs">
							1,558ms
						</span>
					</div>
					<div className="flex items-center justify-between gap-2 border-white/[0.06] border-l px-3 py-2">
						<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
							TTFB
						</span>
						<span className="font-medium font-mono text-amber-500 text-xs">
							Needs work
						</span>
					</div>
					<div className="flex items-center justify-between gap-2 border-white/[0.06] border-l px-3 py-2">
						<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
							Pages
						</span>
						<span className="font-medium font-mono text-foreground text-xs">
							24 tracked
						</span>
					</div>
				</div>
			</div>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-linear-to-t from-background/100 via-background/50 to-transparent sm:h-20" />
		</div>
	);
}
