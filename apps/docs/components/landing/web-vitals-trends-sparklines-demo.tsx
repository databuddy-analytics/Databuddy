"use client";

import { cn } from "@/lib/utils";

type TrendKind = "down-good" | "up-bad" | "flat";

interface TrendRow {
	id: string;
	label: string;
	route: string;
	before: string;
	after: string;
	kind: TrendKind;
	strokeClass: string;
	polylinePoints: string;
}

const ROWS: TrendRow[] = [
	{
		id: "lcp-checkout",
		label: "LCP",
		route: "/checkout",
		before: "3.4s",
		after: "1.6s",
		kind: "down-good",
		strokeClass: "stroke-emerald-500",
		polylinePoints: "2,18 22,15 42,11 62,7 78,4",
	},
	{
		id: "cls-checkout",
		label: "CLS",
		route: "/checkout",
		before: "0.14",
		after: "0.02",
		kind: "down-good",
		strokeClass: "stroke-emerald-500",
		polylinePoints: "2,16 24,13 46,9 68,6 78,4",
	},
	{
		id: "inp-pricing",
		label: "INP",
		route: "/pricing",
		before: "72ms",
		after: "242ms",
		kind: "up-bad",
		strokeClass: "stroke-red-400",
		polylinePoints: "2,6 22,9 42,13 58,17 78,20",
	},
	{
		id: "ttfb-site",
		label: "TTFB",
		route: "site-wide",
		before: "~820ms",
		after: "~820ms",
		kind: "flat",
		strokeClass: "stroke-muted-foreground/60",
		polylinePoints: "2,12 20,11 38,13 56,12 78,12",
	},
];

function Sparkline({ row }: { row: TrendRow }) {
	return (
		<svg
			aria-hidden
			className="h-6 w-20 shrink-0 overflow-visible sm:w-24"
			viewBox="0 0 80 24"
		>
			<polyline
				className={cn(
					"fill-none",
					row.strokeClass,
					row.kind === "flat" && "opacity-80"
				)}
				fill="none"
				points={row.polylinePoints}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

export function WebVitalsTrendsSparklinesDemo() {
	return (
		<div className="divide-y divide-border">
			{ROWS.map((row) => (
				<div
					className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-4 sm:py-3.5"
					key={row.id}
				>
					<div className="min-w-0 flex-1 font-mono text-foreground text-xs tabular-nums sm:flex-none sm:text-sm">
						<span className="text-muted-foreground">{row.label}</span>
						<span className="text-muted-foreground/80"> · </span>
						<span className="truncate">{row.route}</span>
					</div>
					<div className="flex shrink-0 justify-center sm:justify-center">
						<Sparkline row={row} />
					</div>
					<div className="ml-auto shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums sm:ml-0 sm:text-xs">
						<span className="text-muted-foreground/90">{row.before}</span>
						<span className="px-1 text-muted-foreground/50">→</span>
						<span
							className={cn(
								row.kind === "down-good" && "text-emerald-400",
								row.kind === "up-bad" && "text-red-400",
								row.kind === "flat" && "text-muted-foreground"
							)}
						>
							{row.after}
						</span>
					</div>
				</div>
			))}
		</div>
	);
}
