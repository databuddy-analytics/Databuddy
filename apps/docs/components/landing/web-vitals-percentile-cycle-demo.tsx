"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface PercentileRow {
	key: string;
	value: string;
}

const LCP_ROWS: PercentileRow[] = [
	{ key: "p99", value: "6,323ms" },
	{ key: "p95", value: "3,293ms" },
	{ key: "p90", value: "2,476ms" },
	{ key: "p75", value: "1,558ms" },
	{ key: "p50", value: "964ms" },
];

const ROW_CYCLE_MS = 2000;

type PercentileTone = "red" | "amber" | "green";

function percentileTone(percentileKey: string): PercentileTone {
	if (percentileKey === "p99") {
		return "red";
	}
	if (percentileKey === "p75" || percentileKey === "p50") {
		return "green";
	}
	return "amber";
}

const DOT_BY_TONE: Record<PercentileTone, string> = {
	red: "bg-red-400",
	amber: "bg-amber-400",
	green: "bg-emerald-400",
};

export function WebVitalsPercentileCycleDemo() {
	const [activeRowIndex, setActiveRowIndex] = useState(0);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (mq.matches) {
			return;
		}

		const rowId = window.setInterval(() => {
			setActiveRowIndex((i) => (i + 1) % 5);
		}, ROW_CYCLE_MS);

		return () => {
			window.clearInterval(rowId);
		};
	}, []);

	return (
		<div className="mb-4 overflow-hidden rounded border border-border/50 bg-card/30">
			<div className="border-border border-b px-3 py-2.5 text-left font-mono text-[11px] text-muted-foreground uppercase sm:px-4 sm:text-xs">
				LCP
			</div>
			<ul
				aria-label="LCP percentile breakdown"
				className="list-none border-border border-l px-2 py-2 sm:px-3 sm:py-3"
			>
				{LCP_ROWS.map((row, index) => {
					const active = index === activeRowIndex;
					const tone = percentileTone(row.key);

					return (
						<li
							className={cn(
								"flex items-center gap-3 py-2 sm:py-3",
								index > 0 && "border-border/30 border-t"
							)}
							key={row.key}
						>
							<span
								aria-hidden
								className={cn(
									"shrink-0 rounded-full transition-[width,height] duration-200",
									active ? "size-2" : "size-1.5",
									active ? DOT_BY_TONE[tone] : "bg-muted-foreground/40"
								)}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 font-mono text-xs sm:text-sm",
									active ? "text-foreground" : "text-muted-foreground"
								)}
							>
								{row.key}
							</span>
							<span
								className={cn(
									"shrink-0 text-right font-mono text-xs tabular-nums sm:text-sm",
									active ? "text-foreground" : "text-muted-foreground",
									active && "font-semibold"
								)}
							>
								{row.value}
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
