"use client";

import {
	SiBrave,
	SiFirefoxbrowser,
	SiGooglechrome,
	SiOpera,
	SiSafari,
} from "@icons-pack/react-simple-icons";
import { MotionConfig, motion } from "motion/react";
import Image from "next/image";
import {
	FRAME,
	IN_OUT,
	REWIND,
	pseudoRandom,
	rounded,
	toPath,
	useTimeline,
} from "@/components/landing/demo-primitives";
import { cn } from "@/lib/utils";

const GOOD_LCP = 2.5;
const POOR_LCP = 4;

const seconds = (value: number) => `${value.toFixed(1)} s`;

function Readout({
	value,
	className,
}: {
	value: string | number;
	className?: string;
}) {
	return (
		<motion.span
			animate={{ opacity: 1, y: 0 }}
			className={cn("inline-block tabular-nums", className)}
			initial={{ opacity: 0.35, y: -5 }}
			key={value}
			transition={{ duration: 0.35, ease: IN_OUT }}
		>
			{value}
		</motion.span>
	);
}

const SPREAD_SECONDS = 6;
const BATCH = 16;
const DOT_STEP = 8;
const SPREAD_EVENTS = [0.5, 1, 1.5, 2, 2.5] as const;
const SPREAD = Array.from(
	{ length: BATCH * (SPREAD_EVENTS.length + 1) },
	(_, index) => {
		const draw = (key: string) => pseudoRandom(`lcp-${index}-${key}`);
		const middle = (draw("a") + draw("b") + draw("c")) / 3;
		const tail = draw("tail");
		let value = 1.1 + middle * middle * 2.4;
		if (tail < 0.07) {
			value = 4.1 + draw("d") * 1.7;
		} else if (tail < 0.24) {
			value = 2.4 + draw("d") * 1.5;
		}
		return Math.round(value * 10) / 10;
	}
).reduce<{ value: number; bin: number; stack: number }[]>((placed, value) => {
	const bin = Math.round(value * 10);
	const stack = placed.filter((visit) => visit.bin === bin).length;
	placed.push({ value, bin, stack });
	return placed;
}, []);
const SPREAD_TICKS = [0, GOOD_LCP, POOR_LCP, SPREAD_SECONDS] as const;
const SPREAD_ZONES = [
	{ label: "Good", from: 0, to: GOOD_LCP },
	{ label: "Needs improvement", from: GOOD_LCP, to: POOR_LCP },
	{ label: "Poor", from: POOR_LCP, to: SPREAD_SECONDS },
] as const;

const p75 = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.ceil(sorted.length * 0.75) - 1] ?? 0;
};
const onSpread = (value: number) =>
	`${rounded((value / SPREAD_SECONDS) * 100)}%`;
const lcpDot = (value: number) => {
	if (value > POOR_LCP) {
		return "bg-red-500";
	}
	if (value > GOOD_LCP) {
		return "bg-brand-amber";
	}
	return "bg-foreground/60";
};

export function VisitSpread() {
	const { ref, step } = useTimeline(SPREAD_EVENTS, 7);
	const arrived = BATCH * (step + 1);
	const marker = p75(SPREAD.slice(0, arrived).map((visit) => visit.value));
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col gap-4" ref={ref}>
				<div className="flex items-baseline justify-between gap-4">
					<span className="text-muted-foreground text-sm">LCP</span>
					<span className="font-semibold text-foreground text-lg sm:text-xl">
						p75 <Readout value={seconds(marker)} />
					</span>
				</div>
				<div className="relative h-4 text-[11px] text-muted-foreground">
					{SPREAD_ZONES.map((zone) => (
						<span
							className="absolute -translate-x-1/2 whitespace-nowrap"
							key={zone.label}
							style={{ left: onSpread((zone.from + zone.to) / 2) }}
						>
							{zone.label}
						</span>
					))}
				</div>
				<div className="dotted-bg relative h-32 border-white/10 border-b">
					{[GOOD_LCP, POOR_LCP].map((line) => (
						<span
							className="absolute inset-y-0 border-white/15 border-l border-dashed"
							key={line}
							style={{ left: onSpread(line) }}
						/>
					))}
					{SPREAD.map((visit, index) => {
						const shown = index < arrived;
						return (
							<motion.span
								animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : -28 }}
								className={cn(
									"absolute size-1.5 -translate-x-1/2 rounded-full",
									lcpDot(visit.value)
								)}
								initial={false}
								key={index}
								style={{
									left: onSpread(visit.value),
									bottom: 3 + visit.stack * DOT_STEP,
								}}
								transition={
									shown
										? {
												duration: 0.5,
												ease: IN_OUT,
												delay: (index % BATCH) * 0.02,
											}
										: REWIND
								}
							/>
						);
					})}
					<motion.div
						animate={{ left: onSpread(marker) }}
						className="absolute inset-y-0 flex -translate-x-1/2 flex-col items-center"
						initial={false}
						transition={{ duration: 0.5, ease: IN_OUT }}
					>
						<span className="-mt-px bg-background px-1 font-mono text-[10px] text-foreground">
							p75
						</span>
						<span className="w-px flex-1 bg-foreground" />
					</motion.div>
				</div>
				<div className="relative h-4 font-mono text-[11px] text-muted-foreground">
					{SPREAD_TICKS.map((tick, index) => (
						<span
							className={cn(
								"absolute",
								index === 0 && "left-0",
								index === SPREAD_TICKS.length - 1 && "right-0",
								index > 0 &&
									index < SPREAD_TICKS.length - 1 &&
									"-translate-x-1/2"
							)}
							key={tick}
							style={
								index > 0 && index < SPREAD_TICKS.length - 1
									? { left: onSpread(tick) }
									: undefined
							}
						>
							{tick} s
						</span>
					))}
				</div>
			</div>
		</MotionConfig>
	);
}

const SCORE_PARTS = [
	{
		metric: "LCP",
		weight: 30,
		before: 91,
		after: 54,
		was: "1.6 s",
		is: "2.4 s",
	},
	{
		metric: "INP",
		weight: 30,
		before: 89,
		after: 89,
		was: "90 ms",
		is: "90 ms",
	},
	{ metric: "CLS", weight: 25, before: 99, after: 99, was: "0.02", is: "0.02" },
	{
		metric: "FCP",
		weight: 15,
		before: 90,
		after: 90,
		was: "0.9 s",
		is: "0.9 s",
	},
] as const;
const SCORE_EVENTS = [1.6] as const;
const totalScore = (key: "before" | "after") =>
	Math.round(
		SCORE_PARTS.reduce((sum, part) => sum + (part[key] * part.weight) / 100, 0)
	);
const SCORE_BEFORE = totalScore("before");
const SCORE_AFTER = totalScore("after");

export function ExperienceScore() {
	const { ref, step } = useTimeline(SCORE_EVENTS, 6.4);
	const dropped = step >= 1;
	const score = dropped ? SCORE_AFTER : SCORE_BEFORE;
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col gap-8" ref={ref}>
				<div className="flex items-end gap-4">
					<span
						className={cn(
							"font-semibold text-6xl tracking-tight transition-colors duration-500 ease-in-out sm:text-7xl",
							score >= 90 ? "text-emerald-500" : "text-brand-amber"
						)}
					>
						<Readout value={score} />
					</span>
					<div className="flex flex-col gap-1 pb-2">
						<span className="text-foreground text-sm">
							Real Experience Score
						</span>
						<motion.span
							animate={{ opacity: dropped ? 1 : 0 }}
							className="text-muted-foreground text-sm"
							initial={false}
							transition={REWIND}
						>
							−{SCORE_BEFORE - SCORE_AFTER} vs last week
						</motion.span>
					</div>
				</div>
				<div className="flex gap-1">
					{SCORE_PARTS.map((part) => {
						const value = dropped ? part.after : part.before;
						const moved = dropped && part.after !== part.before;
						return (
							<div
								className="flex min-w-0 flex-col gap-3"
								key={part.metric}
								style={{ width: `${part.weight}%` }}
							>
								<div className="relative h-3 bg-white/[0.06]">
									<motion.span
										animate={{ width: `${value}%` }}
										className={cn(
											"absolute inset-y-0 left-0 transition-colors duration-500 ease-in-out",
											moved ? "bg-brand-amber" : "bg-foreground/70"
										)}
										initial={false}
										transition={{ duration: 0.8, ease: IN_OUT }}
									/>
								</div>
								<div className="flex flex-col gap-0.5">
									<span className="text-foreground text-sm">{part.metric}</span>
									<span
										className={cn(
											"font-mono text-xs transition-colors duration-500 ease-in-out",
											moved ? "text-brand-amber" : "text-muted-foreground"
										)}
									>
										<Readout value={dropped ? part.is : part.was} />
									</span>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</MotionConfig>
	);
}

const PAGES = [
	{ name: "/", lcp: 1.6 },
	{ name: "/docs", lcp: 1.3 },
	{ name: "/pricing", lcp: 4.2 },
	{ name: "/blog", lcp: 1.9 },
	{ name: "/signup", lcp: 2.1 },
] as const;
const PAGES_BY_LCP = [...PAGES].sort((a, b) => b.lcp - a.lcp);
const BROWSERS = [
	{ name: "Safari", Logo: SiSafari, lcp: 3.1 },
	{ name: "Firefox", Logo: SiFirefoxbrowser, lcp: 2.2 },
	{ name: "Opera", Logo: SiOpera, lcp: 2 },
	{ name: "Chrome", Logo: SiGooglechrome, lcp: 1.9 },
	{ name: "Brave", Logo: SiBrave, lcp: 1.8 },
] as const;
const SPLITS = ["Page", "Browser", "Country"] as const;
const PAGE_SCALE = 5;
const SLOW_PAGE = "/pricing";
const PAGE_EVENTS = [1.8, 3] as const;
const ROW_GRID =
	"grid grid-cols-[112px_1fr_56px] items-center gap-4 sm:grid-cols-[150px_1fr_72px]";
const onPageScale = (value: number) =>
	`${rounded((value / PAGE_SCALE) * 100)}%`;
const lcpTone = (value: number) => {
	if (value > POOR_LCP) {
		return { bar: "bg-red-500", text: "text-red-500" };
	}
	if (value > GOOD_LCP) {
		return { bar: "bg-brand-amber", text: "text-brand-amber" };
	}
	return { bar: "bg-foreground/40", text: "text-foreground" };
};

function LcpBar({ lcp }: { lcp: number }) {
	return (
		<span className="relative h-2.5">
			{[GOOD_LCP, POOR_LCP].map((line) => (
				<span
					className="absolute -inset-y-2.5 border-white/10 border-l border-dashed"
					key={line}
					style={{ left: onPageScale(line) }}
				/>
			))}
			<span
				className={cn("absolute inset-y-0 left-0", lcpTone(lcp).bar)}
				style={{ width: onPageScale(lcp) }}
			/>
		</span>
	);
}

function LcpValue({ lcp }: { lcp: number }) {
	return (
		<span
			className={cn(
				"text-right font-mono text-xs tabular-nums sm:text-sm",
				lcpTone(lcp).text
			)}
		>
			{seconds(lcp)}
		</span>
	);
}

export function PageBreakdown() {
	const { ref, step } = useTimeline(PAGE_EVENTS, 7.4);
	const byPage = step >= 1;
	const sorted = step >= 2;
	const active = byPage ? "Page" : "Browser";
	const pages = sorted ? PAGES_BY_LCP : PAGES;
	const listTransition = { duration: 0.45, ease: IN_OUT };
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="flex items-center justify-between gap-4 border-white/[0.06] border-b px-5 py-3 sm:px-6">
					<div className="flex items-center gap-1">
						{SPLITS.map((split) => (
							<span
								className={cn(
									"px-2.5 py-1 text-xs transition-colors duration-300 ease-in-out sm:text-sm",
									split === active
										? "bg-white/[0.08] text-foreground"
										: "text-muted-foreground"
								)}
								key={split}
							>
								{split}
							</span>
						))}
					</div>
					<span className="text-muted-foreground text-xs">p75 LCP</span>
				</div>
				<div className="grid px-5 py-2 sm:px-6 [&>*]:col-start-1 [&>*]:row-start-1">
					<motion.ul
						animate={{ opacity: byPage ? 0 : 1 }}
						className="flex flex-col"
						initial={false}
						transition={listTransition}
					>
						{BROWSERS.map((browser) => (
							<li className={cn(ROW_GRID, "py-2.5")} key={browser.name}>
								<span
									className={cn(
										"flex min-w-0 items-center gap-2 text-xs sm:text-sm",
										browser.lcp > GOOD_LCP
											? "text-foreground"
											: "text-muted-foreground"
									)}
								>
									<browser.Logo className="size-3.5 shrink-0 text-muted-foreground" />
									{browser.name}
								</span>
								<LcpBar lcp={browser.lcp} />
								<LcpValue lcp={browser.lcp} />
							</li>
						))}
					</motion.ul>
					<motion.ul
						animate={{ opacity: byPage ? 1 : 0 }}
						className="flex flex-col"
						initial={false}
						transition={listTransition}
					>
						{pages.map((page) => (
							<motion.li
								className={cn(ROW_GRID, "py-2.5")}
								key={page.name}
								layout="position"
								transition={{ duration: 0.6, ease: IN_OUT }}
							>
								<span
									className={cn(
										"truncate font-mono text-xs transition-colors duration-500 ease-in-out sm:text-sm",
										sorted && page.name === SLOW_PAGE
											? "text-foreground"
											: "text-muted-foreground"
									)}
								>
									{page.name}
								</span>
								<LcpBar lcp={page.lcp} />
								<LcpValue lcp={page.lcp} />
							</motion.li>
						))}
					</motion.ul>
				</div>
				<div
					className={cn(
						ROW_GRID,
						"border-white/[0.06] border-t px-5 py-2.5 font-mono text-[11px] text-muted-foreground sm:px-6"
					)}
				>
					<span />
					<span className="relative h-4">
						{[GOOD_LCP, POOR_LCP].map((line) => (
							<span
								className="absolute -translate-x-1/2"
								key={line}
								style={{ left: onPageScale(line) }}
							>
								{line} s
							</span>
						))}
					</span>
					<span />
				</div>
			</div>
		</MotionConfig>
	);
}

const WEEK_DAYS = 14;
const WEEK_BEFORE = 1.9;
const WEEK_AFTER = 4.2;
const TREND_TOP = 5;
const TREND = Array.from({ length: WEEK_DAYS }, (_, day): [number, number] => {
	const base = day < WEEK_DAYS / 2 ? WEEK_BEFORE : WEEK_AFTER;
	const value = base + (pseudoRandom(`pricing-${day}`) - 0.5) * 0.3;
	return [(day / (WEEK_DAYS - 1)) * 1000, 200 - (value / TREND_TOP) * 200];
});
const LAST_WEEK = TREND.slice(0, WEEK_DAYS / 2);
const THIS_WEEK = TREND.slice(WEEK_DAYS / 2 - 1);
const SLOWDOWN_EVENTS = [1, 2.4] as const;
const GOOD_LINE = `${rounded(100 - (GOOD_LCP / TREND_TOP) * 100)}%`;

export function SlowdownFinding() {
	const { ref, step } = useTimeline(SLOWDOWN_EVENTS, 7.2);
	const drawn = step >= 1;
	const flagged = step >= 2;
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="flex items-baseline justify-between gap-4 px-5 pt-5 sm:px-6">
					<span className="font-mono text-foreground text-sm">/pricing</span>
					<span className="text-muted-foreground text-xs">p75 LCP</span>
				</div>
				<div className="dotted-bg relative mx-5 mt-4 h-36 border-white/10 border-b sm:mx-6">
					<span
						className="absolute inset-x-0 border-white/20 border-t border-dashed"
						style={{ top: GOOD_LINE }}
					/>
					<span
						className="absolute right-1 -translate-y-full pb-0.5 font-mono text-[10px] text-muted-foreground"
						style={{ top: GOOD_LINE }}
					>
						{GOOD_LCP} s
					</span>
					<svg
						aria-hidden="true"
						className="absolute inset-0 size-full"
						preserveAspectRatio="none"
						viewBox="0 0 1000 200"
					>
						<path
							className="stroke-foreground/70"
							d={toPath(LAST_WEEK)}
							fill="none"
							strokeWidth={2}
							vectorEffect="non-scaling-stroke"
						/>
						<motion.path
							animate={{ pathLength: drawn ? 1 : 0 }}
							className={cn(
								"transition-colors duration-500 ease-in-out",
								flagged ? "stroke-red-500" : "stroke-foreground/70"
							)}
							d={toPath(THIS_WEEK)}
							fill="none"
							initial={false}
							strokeWidth={2}
							transition={drawn ? { duration: 1, ease: IN_OUT } : REWIND}
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
				</div>
				<div className="mx-5 grid grid-cols-2 pt-2 text-muted-foreground text-xs sm:mx-6">
					<span>Last week</span>
					<span>This week</span>
				</div>
				<motion.div
					animate={{ opacity: flagged ? 1 : 0.15 }}
					className="mt-5 flex gap-3 border-white/[0.06] border-t px-5 py-5 sm:px-6"
					initial={false}
					transition={flagged ? { duration: 0.5, ease: IN_OUT } : REWIND}
				>
					<Image
						alt=""
						className="mt-0.5 size-5 shrink-0"
						height={20}
						src="/brand/bunny/white.svg"
						unoptimized
						width={20}
					/>
					<div className="flex min-w-0 flex-col gap-1">
						<p className="text-foreground text-sm sm:text-base">
							/pricing takes{" "}
							<span className="text-red-500">{seconds(WEEK_AFTER)}</span> to
							load, up from {seconds(WEEK_BEFORE)}.
						</p>
						<p className="text-muted-foreground text-sm">
							38% of slow loads went on to another page, compared with 61% of
							fast ones.
						</p>
					</div>
				</motion.div>
			</div>
		</MotionConfig>
	);
}

const SNIPPET = [
	{ text: "<script", attribute: false },
	{ text: '  src="https://cdn.databuddy.cc/databuddy.js"', attribute: false },
	{ text: '  data-client-id="your-client-id"', attribute: false },
	{ text: "  data-track-web-vitals", attribute: true },
	{ text: "  async", attribute: false },
	{ text: "></script>", attribute: false },
] as const;
const METRICS = [
	{ name: "TTFB", value: "380 ms" },
	{ name: "FCP", value: "0.9 s" },
	{ name: "LCP", value: "1.6 s" },
	{ name: "FPS", value: "60" },
	{ name: "INP", value: "90 ms" },
	{ name: "CLS", value: "0.02" },
] as const;
const SETUP_EVENTS = [0.8, 1.8, 2.2, 2.6, 3, 3.4, 3.8] as const;

export function SetupSignals() {
	const { ref, step } = useTimeline(SETUP_EVENTS, 7);
	const added = step >= 1;
	const captured = Math.max(0, step - 1);
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col gap-6" ref={ref}>
				<pre className="flex flex-col border-white/10 border-l-2 py-1 pl-4 font-mono text-[11px] leading-6 sm:text-xs">
					{SNIPPET.map((line) =>
						line.attribute ? (
							<span className="relative" key={line.text}>
								<motion.span
									animate={{
										clipPath: added ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
									}}
									className="relative inline-block text-brand-amber"
									initial={false}
									transition={added ? { duration: 0.6, ease: IN_OUT } : REWIND}
								>
									{line.text}
								</motion.span>
							</span>
						) : (
							<span className="text-muted-foreground" key={line.text}>
								{line.text}
							</span>
						)
					)}
				</pre>
				<dl className="grid grid-cols-3 gap-x-6 gap-y-4">
					{METRICS.map((metric, index) => {
						const shown = index < captured;
						return (
							<div className="flex flex-col gap-1" key={metric.name}>
								<dt className="text-muted-foreground text-xs">{metric.name}</dt>
								<motion.dd
									animate={{ opacity: shown ? 1 : 0.15, y: shown ? 0 : 4 }}
									className="font-semibold text-foreground text-xl tabular-nums"
									initial={false}
									transition={shown ? { duration: 0.4, ease: IN_OUT } : REWIND}
								>
									{metric.value}
								</motion.dd>
							</div>
						);
					})}
				</dl>
			</div>
		</MotionConfig>
	);
}
