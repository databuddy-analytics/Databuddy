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
		<section
			aria-label="LCP percentile breakdown"
			className="relative overflow-hidden rounded bg-card/30 backdrop-blur-sm"
		>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 z-0 rounded border border-border/50 [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_60%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_0%,black_60%,transparent_100%)]"
			/>

			<div className="relative">
				<div className="border-border/40 border-b bg-background/35 px-2 py-2 text-left font-medium font-mono text-muted-foreground text-xs uppercase tracking-wide sm:px-3 sm:py-2.5">
					LCP
				</div>
				<ul className="relative list-none divide-y divide-border/40 bg-background/25 px-2 py-0 sm:px-3">
					{LCP_ROWS.map((row, index) => {
						const active = index === activeRowIndex;
						const tone = percentileTone(row.key);

						return (
							<li
								className={cn(
									"flex items-center gap-3 py-2 sm:py-2.5",
									active && "bg-muted/5"
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
										"min-w-0 flex-1 font-mono text-xs tabular-nums",
										active ? "text-foreground" : "text-muted-foreground"
									)}
								>
									{row.key}
								</span>
								<span
									className={cn(
										"shrink-0 text-right font-mono text-xs tabular-nums",
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
				<div
					aria-hidden
					className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-linear-to-t from-background/100 via-background/50 to-transparent"
				/>
			</div>
		</section>
	);
}
