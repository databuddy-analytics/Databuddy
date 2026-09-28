"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { SiApple, SiSafari } from "@icons-pack/react-simple-icons";
import Image from "next/image";
import {
	FRAME,
	IN_OUT,
	REWIND,
	StatusLine,
	pseudoRandom,
	useTimeline,
} from "@/components/landing/demo-primitives";
import { cn } from "@/lib/utils";

const TYPE_ERROR = {
	message: "TypeError: Cannot read properties of undefined (reading 'map')",
	occurrences: 486,
	people: 312,
} as const;

function Count({ value, className }: { value: number; className?: string }) {
	return (
		<motion.span
			animate={{ opacity: 1, y: 0 }}
			className={cn("inline-block tabular-nums", className)}
			initial={{ opacity: 0.35, y: -5 }}
			key={value}
			transition={{ duration: 0.35, ease: IN_OUT }}
		>
			{value.toLocaleString("en-US")}
		</motion.span>
	);
}

const PATH = ["/", "/pricing", "/checkout", "/payment", "Paid"] as const;
const PATH_X = [7, 28, 50, 72, 93] as const;
const CHECKOUT = 2;
const PAYMENT = 3;
const LAST_STOP = PATH.length - 1;
const PER_TICK = 2;
const TICKS_PER_CYCLE = 8;
const FIRST_TICK = 6;
const JOURNEY_EVENTS = [0.6, 1.2, 1.8, 2.4, 3, 3.6, 4.2] as const;
const isHit = (visitor: number) => visitor % 5 === 2 || visitor % 7 === 3;
const stopsAtError = (visitor: number) => isHit(visitor) && visitor % 3 !== 0;

export function ErrorJourney() {
	const { ref, step, cycle } = useTimeline(JOURNEY_EVENTS, 4.8);
	const tick = FIRST_TICK + cycle * TICKS_PER_CYCLE + step;
	const firstVisible = PER_TICK * (tick - LAST_STOP - 1);
	const visitors = Array.from(
		{ length: PER_TICK * (LAST_STOP + 2) },
		(_, offset) => firstVisible + offset
	).filter((visitor) => visitor >= 0);
	return (
		<MotionConfig reducedMotion="user">
			<div className={cn(FRAME, "flex flex-col")} ref={ref}>
				<div className="flex items-center justify-between gap-4 border-white/[0.06] border-b px-5 py-4 sm:px-6">
					<span className="min-w-0 truncate font-mono text-red-500 text-xs sm:text-sm">
						{TYPE_ERROR.message}
					</span>
					<span className="flex shrink-0 items-baseline gap-4 text-sm tabular-nums">
						<span>
							<span className="font-semibold text-foreground">
								{TYPE_ERROR.people}
							</span>{" "}
							<span className="text-muted-foreground">people</span>
						</span>
						<span>
							<span className="font-semibold text-red-500">184</span>{" "}
							<span className="text-muted-foreground">left</span>
						</span>
					</span>
				</div>
				<div className="relative mx-5 h-48 sm:mx-8 sm:h-56">
					<span
						className="absolute top-[42%] h-px bg-white/10"
						style={{
							left: `${PATH_X[0]}%`,
							right: `${100 - PATH_X[LAST_STOP]}%`,
						}}
					/>
					{PATH.map((stop, index) => (
						<div
							className="absolute top-[42%] flex -translate-x-1/2 flex-col items-center"
							key={stop}
							style={{ left: `${PATH_X[index]}%` }}
						>
							<span
								className={cn(
									"size-2.5 -translate-y-1/2 rotate-45",
									index === CHECKOUT ? "bg-red-500" : "bg-muted-foreground/60"
								)}
							/>
							<span
								className={cn(
									"mt-3 whitespace-nowrap font-mono text-[11px] sm:text-xs",
									index === CHECKOUT ? "text-red-500" : "text-muted-foreground"
								)}
							>
								{stop}
							</span>
						</div>
					))}
					<AnimatePresence initial={false}>
						{visitors.map((visitor) => {
							const entered = Math.floor(visitor / PER_TICK);
							const travelled = tick - entered;
							const hit = isHit(visitor);
							const stops = stopsAtError(visitor);
							let position = Math.min(travelled, LAST_STOP);
							if (stops) {
								position = Math.min(travelled, CHECKOUT);
							} else if (hit) {
								position = Math.min(travelled, PAYMENT);
							}
							const red = hit && travelled >= CHECKOUT;
							const gone =
								(stops && travelled > CHECKOUT) ||
								(hit && !stops && travelled > PAYMENT);
							const lane = (pseudoRandom(`lane-${visitor}`) - 0.5) * 2;
							return (
								<motion.span
									animate={{
										left: `${PATH_X[position]}%`,
										opacity: gone ? 0 : 1,
										y: stops && travelled > CHECKOUT ? 34 : 0,
									}}
									className={cn(
										"absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-300 ease-in-out",
										red ? "bg-red-500" : "bg-foreground/85"
									)}
									exit={{
										opacity: 0,
										transition: { duration: 0.35, ease: IN_OUT },
									}}
									initial={{ left: `${PATH_X[0] - 6}%`, opacity: 0, y: 0 }}
									key={visitor}
									style={{ top: `calc(42% + ${Math.round(lane * 12)}px)` }}
									transition={{
										duration: 0.45,
										ease: IN_OUT,
										delay: pseudoRandom(`lag-${visitor}`) * 0.12,
									}}
								/>
							);
						})}
					</AnimatePresence>
					<AnimatePresence>
						{visitors
							.filter(
								(visitor) =>
									isHit(visitor) &&
									tick - Math.floor(visitor / PER_TICK) === CHECKOUT
							)
							.map((visitor) => (
								<motion.span
									animate={{ opacity: 0, scale: 3.2 }}
									className="absolute top-[42%] size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-500"
									exit={{ opacity: 0 }}
									initial={{ opacity: 0.9, scale: 1 }}
									key={`ring-${visitor}`}
									style={{ left: `${PATH_X[CHECKOUT]}%` }}
									transition={{ duration: 0.8, ease: IN_OUT, delay: 0.35 }}
								/>
							))}
					</AnimatePresence>
				</div>
			</div>
		</MotionConfig>
	);
}

const GRID_COLUMNS = 26;
const PEOPLE = TYPE_ERROR.people;
const PEOPLE_ORDER = Array.from({ length: PEOPLE }, (_, index) => index)
	.map((index) => ({ index, rank: pseudoRandom(`person-${index}`) }))
	.sort((a, b) => a.rank - b.rank)
	.reduce<number[]>((ranks, person, order) => {
		ranks[person.index] = order;
		return ranks;
	}, []);
const LOUD_STEPS = 10;
const LOUD_EVENTS = [
	0.5, 0.8, 1.1, 1.4, 1.7, 2, 2.3, 2.6, 2.9, 3.2, 4.2,
] as const;
const LOUD_OCCURRENCES = 1240;

function Tally({
	occurrences,
	people,
	peopleLabel,
	highlight,
}: {
	occurrences: number;
	people: number;
	peopleLabel: string;
	highlight: boolean;
}) {
	return (
		<div className="relative grid grid-cols-2 gap-4">
			<div className="flex flex-col gap-1">
				<span className="font-semibold text-3xl text-foreground tracking-tight sm:text-4xl">
					<Count value={occurrences} />
				</span>
				<span className="text-muted-foreground text-xs">occurrences</span>
			</div>
			<div className="flex flex-col gap-1">
				<span
					className={cn(
						"font-semibold text-3xl tracking-tight transition-colors duration-500 ease-in-out sm:text-4xl",
						highlight ? "text-brand-amber" : "text-foreground"
					)}
				>
					<Count value={people} />
				</span>
				<span className="text-muted-foreground text-xs">{peopleLabel}</span>
			</div>
		</div>
	);
}

export function LoudVersusWide() {
	const { ref, step } = useTimeline(LOUD_EVENTS, 7.4);
	const progress = Math.min(step, LOUD_STEPS) / LOUD_STEPS;
	const decided = step > LOUD_STEPS;
	const lit = Math.round(PEOPLE * progress);
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="grid md:grid-cols-2">
					<motion.div
						animate={{ opacity: decided ? 0.5 : 1 }}
						className="flex flex-col gap-5 border-white/[0.06] border-b p-5 sm:p-6 md:border-r md:border-b-0"
						initial={false}
						transition={REWIND}
					>
						<span className="truncate font-mono text-muted-foreground text-xs sm:text-sm">
							Unhandled rejection: Failed to fetch
						</span>
						<Tally
							highlight={false}
							occurrences={Math.round(LOUD_OCCURRENCES * progress)}
							people={step > 0 ? 1 : 0}
							peopleLabel="person"
						/>
						<div className="relative grid h-36 place-items-center">
							{Array.from(
								{ length: Math.min(step, LOUD_STEPS) * 2 },
								(_, pulse) => (
									<motion.span
										animate={{ opacity: 0, scale: 9 }}
										className="absolute size-4 rounded-full border border-red-500/70"
										initial={{ opacity: 0.85, scale: 1 }}
										key={pulse}
										transition={{
											duration: 1.2,
											ease: IN_OUT,
											delay: (pulse % 2) * 0.15,
										}}
									/>
								)
							)}
							<span className="relative size-4 rounded-full bg-red-500" />
						</div>
					</motion.div>
					<div className="relative flex flex-col gap-5 p-5 sm:p-6">
						<motion.span
							animate={{ opacity: decided ? 1 : 0 }}
							className="pointer-events-none absolute inset-0 bg-brand-amber/[0.05]"
							initial={false}
							transition={REWIND}
						/>
						<span className="relative truncate font-mono text-foreground text-xs sm:text-sm">
							TypeError: reading 'map'
						</span>
						<Tally
							highlight={decided}
							occurrences={Math.round(TYPE_ERROR.occurrences * progress)}
							people={lit}
							peopleLabel="people"
						/>
						<div
							className="relative grid h-36 content-center justify-center gap-[3px]"
							style={{
								gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 7px))`,
							}}
						>
							{PEOPLE_ORDER.map((order, index) => (
								<span
									className={cn(
										"size-[7px] transition-colors duration-500 ease-in-out",
										order < lit ? "bg-red-500" : "bg-white/[0.07]"
									)}
									key={index}
									style={{ transitionDelay: `${(order % 31) * 9}ms` }}
								/>
							))}
						</div>
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}

const VISIT = [
	{ time: "14:02:10", label: "Viewed /", kind: "page" },
	{ time: "14:02:52", label: "Viewed /pricing", kind: "page" },
	{ time: "14:03:25", label: "Viewed /checkout", kind: "page" },
	{ time: "14:03:28", label: TYPE_ERROR.message, kind: "error" },
	{ time: "", label: "/payment", kind: "ghost" },
	{ time: "", label: "Paid", kind: "ghost" },
] as const;
const VISIT_EVENTS = VISIT.map((_, index) => 0.6 + index * 0.6);

export function VisitTimeline() {
	const { ref, step } = useTimeline(VISIT_EVENTS, 7.2);
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="border-white/[0.06] border-b px-5 py-3 sm:px-6">
					<span className="flex items-center gap-4 font-medium text-foreground text-sm">
						<span className="flex items-center gap-1.5">
							<SiSafari className="size-3.5" />
							Safari
						</span>
						<span className="flex items-center gap-1.5">
							<SiApple className="size-3.5" />
							iPhone
						</span>
					</span>
				</div>
				<ol className="relative flex flex-col gap-3.5 px-5 py-5 sm:px-6">
					{VISIT.map((entry, index) => {
						const shown = step > index;
						const isError = entry.kind === "error";
						const isGhost = entry.kind === "ghost";
						let opacity = 0.15;
						if (shown) {
							opacity = isGhost ? 0.45 : 1;
						}
						return (
							<motion.li
								animate={{ opacity }}
								className="relative grid grid-cols-[16px_1fr] gap-3"
								initial={false}
								key={entry.label}
								transition={shown ? { duration: 0.45, ease: IN_OUT } : REWIND}
							>
								<span
									className={cn(
										"mt-1 size-2.5 rotate-45",
										isError && "bg-red-500",
										entry.kind === "page" && "bg-muted-foreground",
										isGhost && "border border-muted-foreground border-dashed"
									)}
								/>
								<div className="flex min-w-0 flex-col gap-0.5">
									<span
										className={cn(
											"truncate text-sm",
											isError && "font-mono text-red-500 text-xs sm:text-sm",
											entry.kind === "page" && "text-foreground",
											isGhost && "text-muted-foreground line-through"
										)}
									>
										{entry.label}
									</span>
									{entry.time && (
										<span className="font-mono text-[11px] text-muted-foreground">
											{entry.time}
										</span>
									)}
								</div>
							</motion.li>
						);
					})}
				</ol>
			</div>
		</MotionConfig>
	);
}

const GRID_SIDE = 10;
const SESSION_GRIDS = [
	{ label: "Hit the error", kept: 41 },
	{ label: "Similar visits", kept: 63 },
] as const;
const SESSION_CELLS = Array.from(
	{ length: GRID_SIDE * GRID_SIDE },
	(_, index) => index
);
const KEPT_EVENTS = [0.8, 1.8, 2.8, 3.8, 5] as const;

export function KeptGoing() {
	const { ref, step } = useTimeline(KEPT_EVENTS, 8.4);
	const filled = step >= 1;
	const stopped = step >= 2;
	const measured = step >= 3;
	const posted = step >= 4;
	const resolved = step >= 5;
	const gap = (SESSION_GRIDS[1]?.kept ?? 0) - (SESSION_GRIDS[0]?.kept ?? 0);
	let status = "Checking";
	if (resolved) {
		status = "Resolved";
	} else if (posted) {
		status = "Posted to #analytics";
	}
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="flex flex-wrap items-center justify-between gap-3 border-white/[0.06] border-b px-5 py-3 sm:px-6">
					<span className="flex items-center gap-2.5">
						<Image
							alt=""
							height={18}
							src="/brand/bunny/white.svg"
							unoptimized
							width={18}
						/>
						<span className="font-medium text-foreground text-sm">
							Databunny
						</span>
					</span>
					<StatusLine tone={resolved ? "emerald" : "amber"}>
						{status}
					</StatusLine>
				</div>
				<div className="grid gap-8 px-5 py-6 sm:grid-cols-2 sm:gap-12 sm:px-6 lg:grid-cols-[auto_auto_1fr]">
					{SESSION_GRIDS.map((grid, gridIndex) => {
						const exposed = gridIndex === 0;
						return (
							<div className="flex w-fit flex-col gap-4" key={grid.label}>
								<div className="flex items-baseline justify-between gap-3">
									<span className="text-muted-foreground text-sm">
										{grid.label}
									</span>
									<motion.span
										animate={{ opacity: measured ? 1 : 0.15 }}
										className={cn(
											"font-semibold text-2xl tabular-nums sm:text-3xl",
											exposed ? "text-red-500" : "text-foreground"
										)}
										initial={false}
										transition={REWIND}
									>
										{grid.kept}%
									</motion.span>
								</div>
								<div
									className="grid w-fit gap-1.5"
									style={{
										gridTemplateColumns: `repeat(${GRID_SIDE}, 14px)`,
									}}
								>
									{SESSION_CELLS.map((index) => {
										const kept = index < grid.kept;
										let tone = "bg-white/[0.06]";
										if (filled && kept) {
											tone = "bg-foreground/85";
										} else if (stopped && !kept) {
											tone = exposed ? "bg-red-500" : "bg-white/[0.12]";
										}
										return (
											<span
												className={cn(
													"size-3.5 rounded-full transition-colors duration-500 ease-in-out",
													tone
												)}
												key={index}
												style={{
													transitionDelay: `${(index % 50) * 8}ms`,
												}}
											/>
										);
									})}
								</div>
							</div>
						);
					})}
					<motion.div
						animate={{ opacity: measured ? 1 : 0.12, y: measured ? 0 : 6 }}
						className="flex flex-col justify-center gap-2 sm:col-span-2 lg:col-span-1 lg:border-white/[0.06] lg:border-l lg:pl-12"
						initial={false}
						transition={measured ? { duration: 0.5, ease: IN_OUT } : REWIND}
					>
						<span className="font-semibold text-5xl text-brand-amber tabular-nums tracking-tight sm:text-6xl">
							{gap}
						</span>
						<span className="text-foreground text-sm sm:text-base">
							fewer out of every 100 kept going
						</span>
						<span className="text-muted-foreground text-xs">
							Compared with visits on the same page, day, and device.
						</span>
					</motion.div>
				</div>
			</div>
		</MotionConfig>
	);
}

const SNIPPET = [
	{ text: "<script", attribute: false },
	{ text: '  src="https://cdn.databuddy.cc/databuddy.js"', attribute: false },
	{ text: '  data-client-id="your-client-id"', attribute: false },
	{ text: "  data-track-errors", attribute: true },
	{ text: "  async", attribute: false },
	{ text: "></script>", attribute: false },
] as const;
const PILLS = [
	{ label: "TypeError: reading 'map'", noise: false },
	{ label: "Error at chrome-extension://", noise: true },
	{ label: "Unhandled rejection: Failed to fetch", noise: false },
	{ label: "Script error.", noise: true },
	{ label: "ResizeObserver loop completed", noise: true },
	{ label: "RangeError: Invalid time value", noise: false },
] as const;
const NOISE_EVENTS = [0.9, 1.7, 2.1, 2.5, 2.9, 3.3, 3.7] as const;

export function NoiseGate() {
	const { ref, step } = useTimeline(NOISE_EVENTS, 7.2);
	const added = step >= 1;
	const sent = Math.max(0, step - 1);
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="flex items-center justify-between gap-4 border-white/[0.06] border-b px-5 py-3 sm:px-6">
					<span className="font-mono text-foreground text-xs">index.html</span>
				</div>
				<pre className="flex flex-col px-5 py-4 font-mono text-[11px] leading-6 sm:px-6 sm:text-xs">
					{SNIPPET.map((line) =>
						line.attribute ? (
							<span className="relative" key={line.text}>
								<motion.span
									animate={{ opacity: added ? 1 : 0 }}
									className="absolute -inset-x-2 inset-y-0 bg-brand-amber/[0.1]"
									initial={false}
									transition={REWIND}
								/>
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
				<div className="grid grid-cols-2 gap-4 border-white/[0.06] border-t px-5 pt-3 font-mono text-[10px] text-muted-foreground sm:px-6 sm:text-[11px]">
					<span>Browser</span>
					<span className="text-right">Databuddy</span>
				</div>
				<ul className="relative flex flex-col gap-1.5 px-5 py-3 sm:px-6">
					<span className="absolute inset-y-2 left-1/2 w-px bg-brand-amber/50" />
					{PILLS.map((pill, index) => {
						const moved = sent > index;
						if (pill.noise) {
							return (
								<li
									className="relative flex h-6 items-center gap-2"
									key={pill.label}
								>
									<motion.span
										animate={{ opacity: moved ? 0.4 : 1 }}
										className={cn(
											"max-w-[48%] truncate border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:text-[11px]",
											moved && "line-through"
										)}
										initial={false}
										transition={REWIND}
									>
										{pill.label}
									</motion.span>
								</li>
							);
						}
						return (
							<li className="relative h-6" key={pill.label}>
								<motion.span
									animate={{
										left: moved ? "100%" : "0%",
										x: moved ? "-100%" : "0%",
									}}
									className="absolute top-0 max-w-[48%] truncate border border-red-500/40 px-1.5 py-0.5 font-mono text-[10px] text-red-500 sm:text-[11px]"
									initial={false}
									transition={moved ? { duration: 0.7, ease: IN_OUT } : REWIND}
								>
									{pill.label}
								</motion.span>
							</li>
						);
					})}
				</ul>
			</div>
		</MotionConfig>
	);
}
