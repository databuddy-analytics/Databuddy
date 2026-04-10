"use client";

import {
	SiFacebook,
	SiFirefox,
	SiGooglechrome,
	SiSafari,
	SiX,
} from "@icons-pack/react-simple-icons";
import { BrowsersIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type VitalStatus = "good" | "needs-improvement" | "poor" | "neutral";

interface VitalMetric {
	value: string;
	status: VitalStatus;
}

interface BreakdownRow {
	label: string;
	samples: string;
	visitors?: string;
	lcp: VitalMetric;
	fcp: VitalMetric;
	cls: VitalMetric;
	inp: VitalMetric;
}

const PAGE_ROWS: BreakdownRow[] = [
	{
		label: "/",
		samples: "18.1K",
		lcp: { value: "1.6s", status: "good" },
		fcp: { value: "1.7s", status: "good" },
		cls: { value: "0.000", status: "good" },
		inp: { value: "88ms", status: "good" },
	},
	{
		label: "/contact",
		samples: "2.3K",
		lcp: { value: "1.2s", status: "good" },
		fcp: { value: "1.6s", status: "good" },
		cls: { value: "0.000", status: "good" },
		inp: { value: "242ms", status: "needs-improvement" },
	},
	{
		label: "/pricing",
		samples: "830",
		lcp: { value: "987ms", status: "good" },
		fcp: { value: "912ms", status: "good" },
		cls: { value: "N/A", status: "neutral" },
		inp: { value: "72ms", status: "good" },
	},
	{
		label: "/checkout",
		samples: "612",
		lcp: { value: "3.4s", status: "poor" },
		fcp: { value: "2.8s", status: "needs-improvement" },
		cls: { value: "0.14", status: "needs-improvement" },
		inp: { value: "188ms", status: "needs-improvement" },
	},
	{
		label: "/docs",
		samples: "4.2K",
		lcp: { value: "2.1s", status: "needs-improvement" },
		fcp: { value: "1.9s", status: "good" },
		cls: { value: "0.02", status: "good" },
		inp: { value: "96ms", status: "good" },
	},
	{
		label: "/blog",
		samples: "3.8K",
		lcp: { value: "1.9s", status: "good" },
		fcp: { value: "1.8s", status: "good" },
		cls: { value: "0.04", status: "good" },
		inp: { value: "104ms", status: "good" },
	},
];

type BrowserGlyphKind =
	| "chrome"
	| "edge"
	| "facebook"
	| "firefox"
	| "safari"
	| "x";

interface BrowserBreakdownRow {
	id: string;
	name: string;
	glyphKind: BrowserGlyphKind;
	visitors: string;
	lcp: VitalMetric;
	fcp: VitalMetric;
}

const BROWSER_ROWS: BrowserBreakdownRow[] = [
	{
		id: "chrome",
		name: "Chrome",
		glyphKind: "chrome",
		visitors: "2.9K",
		lcp: { value: "864ms", status: "good" },
		fcp: { value: "872ms", status: "good" },
	},
	{
		id: "mobile-chrome",
		name: "Mobile Chrome",
		glyphKind: "chrome",
		visitors: "361",
		lcp: { value: "3.8s", status: "poor" },
		fcp: { value: "3.1s", status: "poor" },
	},
	{
		id: "mobile-safari",
		name: "Mobile Safari",
		glyphKind: "safari",
		visitors: "367",
		lcp: { value: "3.4s", status: "poor" },
		fcp: { value: "2.9s", status: "needs-improvement" },
	},
	{
		id: "facebook",
		name: "Facebook",
		glyphKind: "facebook",
		visitors: "221",
		lcp: { value: "1.2s", status: "good" },
		fcp: { value: "1.1s", status: "good" },
	},
];

function BrowserGlyph({ kind }: { kind: BrowserGlyphKind }) {
	const wrap =
		"inline-flex size-4 shrink-0 items-center justify-center [&_svg]:block";
	switch (kind) {
		case "chrome":
			return (
				<span aria-hidden className={wrap}>
					<SiGooglechrome size={16} />
				</span>
			);
		case "firefox":
			return (
				<span aria-hidden className={wrap}>
					<SiFirefox size={16} />
				</span>
			);
		case "safari":
			return (
				<span aria-hidden className={wrap}>
					<SiSafari size={16} />
				</span>
			);
		case "facebook":
			return (
				<span aria-hidden className={wrap}>
					<SiFacebook size={16} />
				</span>
			);
		case "x":
			return (
				<span aria-hidden className={wrap}>
					<SiX size={16} />
				</span>
			);
		case "edge":
			return (
				<span aria-hidden className={wrap}>
					<BrowsersIcon className="size-4 text-blue-400" weight="duotone" />
				</span>
			);
		default: {
			const exhaustive: never = kind;
			return exhaustive;
		}
	}
}

function metricTextClass(status: VitalStatus): string {
	switch (status) {
		case "good":
			return "text-green-300";
		case "needs-improvement":
			return "text-amber-300";
		case "poor":
			return "text-red-400";
		case "neutral":
			return "text-muted-foreground";
		default: {
			const exhaustive: never = status;
			return exhaustive;
		}
	}
}

function MetricCell({
	metric,
	errorRow,
	compact,
}: {
	metric: VitalMetric;
	errorRow: boolean;
	compact: boolean;
}) {
	return (
		<td
			className={cn(
				compact
					? "whitespace-nowrap px-2 py-2 text-right font-mono text-xs tabular-nums"
					: "whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] tabular-nums sm:px-4 sm:text-xs",
				errorRow && "text-red-400"
			)}
		>
			<span
				className={cn(
					"inline-flex items-center justify-end gap-1",
					errorRow ? "text-red-400" : metricTextClass(metric.status)
				)}
			>
				{metric.value}
			</span>
		</td>
	);
}

const thFirstNormal =
	"text-balance px-3 py-2.5 text-left font-medium font-mono text-[10px] text-muted-foreground capitalize sm:px-4 sm:text-[11px]";

const thFirstCompact =
	"text-balance px-2 py-2 text-left font-medium font-mono text-xs text-muted-foreground capitalize";

const thNumericNormal =
	"text-balance px-3 py-2.5 text-right font-medium font-mono text-[10px] text-muted-foreground sm:px-4 sm:text-[11px]";

const thNumericCompact =
	"text-balance px-2 py-2 text-right font-medium font-mono text-xs text-muted-foreground";

function BreakdownTable({
	firstColumn,
	rows,
	showVisitorsColumn,
	compact,
}: {
	firstColumn: string;
	rows: BreakdownRow[];
	showVisitorsColumn: boolean;
	compact: boolean;
}) {
	const minWidthClass =
		compact && !showVisitorsColumn
			? "min-w-0"
			: showVisitorsColumn
				? "min-w-[720px]"
				: "min-w-[420px]";

	return (
		<div className="overflow-x-auto">
			<table className={cn("w-full border-collapse text-left", minWidthClass)}>
				<thead>
					<tr className="border-border/40 border-b bg-background/35">
						<th
							className={compact ? thFirstCompact : thFirstNormal}
							scope="col"
						>
							{firstColumn}
						</th>
						{showVisitorsColumn ? (
							<th
								className={compact ? thNumericCompact : thNumericNormal}
								scope="col"
							>
								Visitors
							</th>
						) : null}
						<th
							className={compact ? thNumericCompact : thNumericNormal}
							scope="col"
						>
							LCP
						</th>
						<th
							className={compact ? thNumericCompact : thNumericNormal}
							scope="col"
						>
							FCP
						</th>
						<th
							className={compact ? thNumericCompact : thNumericNormal}
							scope="col"
						>
							CLS
						</th>
						<th
							className={compact ? thNumericCompact : thNumericNormal}
							scope="col"
						>
							INP
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border/40 bg-background/25">
					{rows.map((row) => {
						const checkoutRow = row.label === "/checkout";

						return (
							<tr
								className={cn(
									"hover:bg-muted/10",
									checkoutRow &&
										"bg-red-950/45 hover:bg-red-950/55 dark:bg-red-950/50 dark:hover:bg-red-950/60"
								)}
								key={row.label}
							>
								<td
									className={cn(
										compact
											? "max-w-[100px] truncate px-2 py-2 font-mono text-xs"
											: "max-w-[140px] truncate px-3 py-2.5 font-mono text-xs sm:px-4 sm:text-sm",
										checkoutRow ? "text-red-400" : "text-foreground"
									)}
								>
									{row.label}
								</td>
								{showVisitorsColumn ? (
									<td
										className={cn(
											compact
												? "whitespace-nowrap px-2 py-2 text-right font-mono text-xs tabular-nums"
												: "whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] tabular-nums sm:px-4 sm:text-xs",
											checkoutRow ? "text-red-400" : "text-muted-foreground"
										)}
									>
										{row.visitors ?? "—"}
									</td>
								) : null}
								<MetricCell
									compact={compact}
									errorRow={checkoutRow}
									metric={row.lcp}
								/>
								<MetricCell
									compact={compact}
									errorRow={checkoutRow}
									metric={row.fcp}
								/>
								<MetricCell
									compact={compact}
									errorRow={checkoutRow}
									metric={row.cls}
								/>
								<MetricCell
									compact={compact}
									errorRow={checkoutRow}
									metric={row.inp}
								/>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function BrowserBreakdownTable({ compact }: { compact: boolean }) {
	const minWidthClass = compact ? "min-w-[520px]" : "min-w-[580px]";

	return (
		<div className="overflow-x-auto">
			<table className={cn("w-full border-collapse text-left", minWidthClass)}>
				<thead>
					<tr className="border-border/40 border-b bg-background/35">
						<th
							className={compact ? thFirstCompact : thFirstNormal}
							scope="col"
						>
							Browser
						</th>
						<th
							className={compact ? thNumericCompact : thNumericNormal}
							scope="col"
						>
							Visitors
						</th>
						<th
							className={compact ? thNumericCompact : thNumericNormal}
							scope="col"
						>
							LCP
						</th>
						<th
							className={compact ? thNumericCompact : thNumericNormal}
							scope="col"
						>
							FCP
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border/40 bg-background/25">
					{BROWSER_ROWS.map((row) => (
						<tr className="hover:bg-muted/10" key={row.id}>
							<td
								className={cn(
									compact
										? "max-w-[140px] truncate px-2 py-2 font-mono text-xs"
										: "max-w-[180px] truncate px-3 py-2.5 font-mono text-xs sm:px-4 sm:text-sm",
									"text-foreground"
								)}
							>
								<span className="inline-flex min-w-0 items-center gap-2">
									<BrowserGlyph kind={row.glyphKind} />
									<span className="truncate">{row.name}</span>
								</span>
							</td>
							<td
								className={cn(
									compact
										? "whitespace-nowrap px-2 py-2 text-right font-mono text-xs tabular-nums"
										: "whitespace-nowrap px-3 py-2.5 text-right font-mono text-[11px] tabular-nums sm:px-4 sm:text-xs",
									"text-muted-foreground"
								)}
							>
								{row.visitors}
							</td>
							<MetricCell compact={compact} errorRow={false} metric={row.lcp} />
							<MetricCell compact={compact} errorRow={false} metric={row.fcp} />
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

const breakdownShellClass =
	"relative overflow-hidden rounded bg-card/30 backdrop-blur-sm";

const breakdownMaskClass =
	"pointer-events-none absolute inset-0 z-0 rounded border border-border/50 [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_60%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_0%,black_60%,transparent_100%)]";

/** Short bottom fade — matches browser + page breakdown + percentile demos. */
const breakdownFadeClass =
	"pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-linear-to-t from-background/100 via-background/50 to-transparent";

export function WebVitalsBreakdownDemo({
	variant = "page",
	compact = false,
}: {
	variant?: "browser" | "page";
	compact?: boolean;
} = {}) {
	if (variant === "browser") {
		return (
			<section
				aria-label="Core Web Vitals breakdown by browser"
				className={breakdownShellClass}
			>
				<div aria-hidden className={breakdownMaskClass} />

				<div className="relative">
					<BrowserBreakdownTable compact={compact} />
					<div aria-hidden className={breakdownFadeClass} />
				</div>
			</section>
		);
	}

	return (
		<section
			aria-label="Core Web Vitals breakdown by page and geography"
			className={breakdownShellClass}
		>
			<div aria-hidden className={breakdownMaskClass} />

			<div className="relative">
				<BreakdownTable
					compact={compact}
					firstColumn="Page"
					rows={PAGE_ROWS}
					showVisitorsColumn={false}
				/>
				<div aria-hidden className={breakdownFadeClass} />
			</div>
		</section>
	);
}
