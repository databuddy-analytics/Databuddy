"use client";

import {
	AnimatePresence,
	MotionConfig,
	motion,
	useInView,
	useReducedMotion,
} from "motion/react";
import {
	SiGithub,
	SiGoogle,
	SiX,
	SiYcombinator,
} from "@icons-pack/react-simple-icons";
import Image from "next/image";
import { type FC, useEffect, useId, useMemo, useRef, useState } from "react";
import {
	FRAME,
	IN_OUT,
	pseudoRandom,
	REWIND,
	Reveal,
	rounded,
	SlackLogo,
	StatusLine,
	toPath,
	useTimeline,
} from "@/components/landing/demo-primitives";
import { cn } from "@/lib/utils";

const percent = (value: number, of: number) =>
	`${rounded((value / of) * 100)}%`;

const enter = (delay: number, distance = 8) => ({
	initial: { opacity: 0, y: distance },
	animate: { opacity: 1, y: 0 },
	transition: { duration: 0.5, ease: IN_OUT, delay },
});

const useAfter = (seconds: number, key: unknown = seconds) => {
	const [doneFor, setDoneFor] = useState<unknown>(undefined);
	useEffect(() => {
		const id = window.setTimeout(() => setDoneFor(key), seconds * 1000);
		return () => window.clearTimeout(id);
	}, [seconds, key]);
	return doneFor === key;
};

const useCount = (times: readonly number[]) => {
	const [count, setCount] = useState(0);
	useEffect(() => {
		const ids = times.map((time) =>
			window.setTimeout(() => setCount((current) => current + 1), time * 1000)
		);
		return () => {
			for (const id of ids) {
				window.clearTimeout(id);
			}
		};
	}, [times]);
	return count;
};

const pick = <T,>(items: readonly [T, ...T[]], index: number) =>
	items[index % items.length] ?? items[0];

const INCIDENT_SOURCES = [
	"Sessions",
	"Events",
	"Funnels",
	"Errors",
	"Web Vitals",
	"Deploys",
	"Revenue",
] as const;
type IncidentSource = (typeof INCIDENT_SOURCES)[number];

const QUIET_RESULTS: Record<IncidentSource, string> = {
	Sessions: "traffic normal",
	Events: "no tracking gaps",
	Funnels: "no drop-off",
	Errors: "no new errors",
	"Web Vitals": "normal",
	Deploys: "no deploys",
	Revenue: "no change",
};

interface IncidentLane {
	sub: string;
	title: string;
}

interface Incident {
	answer: {
		headline: string;
		next: string;
		outcomeLabel: string;
		outcomeValue: string;
		why: string;
	};
	barsRise: boolean;
	captionLead: string;
	cause: { label: string; sha: string; time: string };
	change: string;
	findings: Partial<Record<Exclude<IncidentSource, "Deploys">, string>>;
	id: string;
	lanes: [IncidentLane, IncidentLane];
	metric: string;
	rises: boolean;
	split: number;
}

const INCIDENTS: [Incident, ...Incident[]] = [
	{
		id: "signup",
		metric: "Signup completion",
		change: "−18%",
		findings: {
			Events: "verification_sent −28% on mobile",
			Funnels: "verify step −31% on mobile",
		},
		lanes: [
			{ title: "Funnels", sub: "verify step, mobile" },
			{ title: "Events", sub: "verification_sent, mobile" },
		],
		cause: { sha: "a41f0c2", label: "verification copy", time: "09:12" },
		barsRise: false,
		captionLead: "Mobile drop-off starts right after",
		split: 34,
		rises: false,
		answer: {
			headline: "New verification copy is losing mobile signups",
			why: "Mobile visitors reach signup, then leave at email verification.",
			next: "Restore the shorter verification copy for mobile",
			outcomeLabel: "Signup completion, mobile",
			outcomeValue: "Back to 62%",
		},
	},
	{
		id: "checkout",
		metric: "Checkout conversion",
		change: "−37%",
		findings: {
			Funnels: "payment step −31% on iOS Safari",
			Errors: "TypeError spike on /checkout/shipping",
		},
		lanes: [
			{ title: "Funnels", sub: "payment step, iOS Safari" },
			{ title: "Errors", sub: "/checkout/shipping" },
		],
		cause: { sha: "7c2e9f1", label: "address autocomplete", time: "13:58" },
		barsRise: true,
		captionLead: "Errors and the drop start the minute",
		split: 28,
		rises: false,
		answer: {
			headline: "A deploy broke checkout on iOS Safari",
			why: "Address autocomplete throws a TypeError on Safari 18, so shoppers never reach payment.",
			next: "Roll back address autocomplete",
			outcomeLabel: "Checkout conversion, iOS Safari",
			outcomeValue: "Back to 4.0%",
		},
	},
	{
		id: "inp",
		metric: "Signup INP, p75",
		change: "+42%",
		findings: {
			Funnels: "plan step −12% on /signup",
			"Web Vitals": "INP 284 ms p75 on /signup",
		},
		lanes: [
			{ title: "Web Vitals", sub: "INP p75, /signup" },
			{ title: "Funnels", sub: "plan step, /signup" },
		],
		cause: { sha: "e90b7d4", label: "pricing calculator", time: "16:40" },
		barsRise: false,
		captionLead: "INP climbs the minute",
		split: 22,
		rises: true,
		answer: {
			headline: "Script growth slowed the plan selector",
			why: "The pricing calculator bundle blocks input on /signup, right where new users pick a plan.",
			next: "Defer the pricing calculator bundle",
			outcomeLabel: "Signup INP, p75",
			outcomeValue: "Back to 190 ms",
		},
	},
];

const checksFor = (incident: Incident) =>
	INCIDENT_SOURCES.map((name, order) => {
		const finding =
			name === "Deploys"
				? `${incident.cause.sha} ${incident.cause.label} at ${incident.cause.time}`
				: incident.findings[name];
		const hit = finding !== undefined;
		const start = 0.45 + order * 0.17;
		return {
			name,
			result: finding ?? QUIET_RESULTS[name],
			hit,
			start,
			finish:
				start +
				0.3 +
				pseudoRandom(`${incident.id}-${name}`) * 0.35 +
				(hit ? 0.25 : 0),
		};
	});

const RECOVERED_AT = 3.4;
const EXIT_SECONDS = 0.3;

function MomentHeadline({
	text,
	accent,
	accentAt = 0,
	accentClassName = "text-brand-amber",
	sweep = false,
}: {
	text: string;
	accent?: string;
	accentAt?: number;
	accentClassName?: string;
	sweep?: boolean;
}) {
	const lit = useAfter(accentAt);
	return (
		<div className="flex flex-col gap-4">
			<h4 className="font-semibold text-foreground text-xl tracking-tight sm:text-2xl md:text-3xl">
				{text
					.split(" ")
					.map((word, position) => ({ word, position }))
					.map(({ word, position }) => (
						<span key={`${position}-${word}`}>
							<span className="-mb-[0.15em] inline-block overflow-hidden pb-[0.15em] align-top">
								<motion.span
									animate={{ y: "0%" }}
									className={cn(
										"inline-block transition-colors duration-500",
										word === accent && lit && accentClassName
									)}
									initial={{ y: "110%" }}
									transition={{
										delay: 0.05 + position * 0.03,
										duration: 0.6,
										ease: IN_OUT,
									}}
								>
									{word}
								</motion.span>
							</span>{" "}
						</span>
					))}
			</h4>
			<div className="relative h-px bg-border">
				{sweep && (
					<motion.div
						animate={{ scaleX: 1, opacity: [1, 1, 0] }}
						className="absolute -top-px left-0 h-0.5 w-full origin-left bg-brand-amber"
						initial={{ scaleX: 0, opacity: 1 }}
						transition={{ duration: 1, ease: IN_OUT, delay: 0.3 }}
					/>
				)}
			</div>
		</div>
	);
}

function IncidentScan({
	incident,
	live,
}: {
	incident: Incident;
	live: boolean;
}) {
	const checks = useMemo(() => checksFor(incident), [incident]);
	const byFinish = useMemo(
		() => [...checks].sort((a, b) => a.finish - b.finish),
		[checks]
	);
	const finishTimes = useMemo(
		() => (live ? byFinish.map((check) => check.finish) : []),
		[byFinish, live]
	);
	const finishedCount = useCount(finishTimes);
	const finished = byFinish.slice(0, finishedCount).map((check) => check.name);
	const signals = checks.filter(
		(check) => check.hit && finished.includes(check.name)
	).length;
	return (
		<div className="flex flex-1 flex-col gap-5">
			<MomentHeadline
				accent={incident.change}
				accentClassName="text-red-500"
				text={`${incident.metric} ${incident.change}`}
			/>
			<motion.ul
				className="flex flex-1 flex-col justify-between gap-2"
				{...enter(0.2, 0)}
			>
				{checks.map((check) => {
					const done = finished.includes(check.name);
					const found = done && check.hit;
					return (
						<motion.li
							animate={{ opacity: done && !check.hit ? 0.35 : 1 }}
							className="grid grid-cols-[10px_88px_1fr] items-center gap-3 sm:grid-cols-[10px_130px_1fr] md:grid-cols-[10px_150px_200px_1fr] md:gap-4"
							initial={false}
							key={check.name}
							transition={{ duration: 0.5, ease: IN_OUT }}
						>
							<span className="relative size-2.5 border border-muted-foreground/40">
								<motion.span
									animate={{ scale: found ? 1 : 0 }}
									className="absolute -inset-px bg-brand-amber"
									initial={false}
									transition={{ duration: 0.3, ease: IN_OUT }}
								/>
							</span>
							<span
								className={cn(
									"flex items-center gap-2 font-medium text-sm transition-colors duration-300 sm:text-base",
									found ? "text-foreground" : "text-muted-foreground"
								)}
							>
								{check.name === "Deploys" && (
									<SiGithub className="size-3.5 shrink-0" />
								)}
								{check.name}
							</span>
							<span className="relative hidden h-0.5 bg-border md:block">
								<motion.span
									animate={{ scaleX: live ? 1 : 0 }}
									className={cn(
										"absolute inset-y-0 left-0 w-full origin-left transition-colors duration-300",
										found ? "bg-brand-amber" : "bg-muted-foreground/50"
									)}
									initial={{ scaleX: 0 }}
									transition={{
										delay: check.start,
										duration: check.finish - check.start,
										ease: IN_OUT,
									}}
								/>
							</span>
							<motion.span
								animate={{ opacity: done ? 1 : 0, x: done ? 0 : -6 }}
								className={cn(
									"font-mono text-[12px] sm:text-sm",
									check.hit ? "text-foreground" : "text-muted-foreground/60"
								)}
								initial={false}
								transition={{ duration: 0.35, ease: IN_OUT }}
							>
								{check.result}
							</motion.span>
						</motion.li>
					);
				})}
			</motion.ul>
			<motion.p
				className="text-sm tabular-nums sm:text-base"
				{...enter(0.2, 0)}
			>
				<span className="text-muted-foreground">
					{finished.length} of {checks.length} sources checked
				</span>
				{signals > 0 && (
					<span className="text-brand-amber">
						, {signals} {signals === 1 ? "signal" : "signals"} found
					</span>
				)}
			</motion.p>
		</div>
	);
}

const COLUMNS = 60;
const PLOT_W = 1000;
const PLOT_H = 300;
const PLOT_INSET = 8;
const BAR_BASE = 190;
const DEPLOY_Y = 250;
const LINK_AT = 1.35;
const LINK_SECONDS = 0.4;
const LINKED_AT = LINK_AT + LINK_SECONDS;

const pointAt = (incident: Incident, index: number) => {
	const badness = Math.min(1, Math.max(0, (index - incident.split) / 5));
	const before = index < incident.split;
	const height = pseudoRandom(`${incident.id}-b${index}`);
	return {
		index,
		x: PLOT_INSET + (index / (COLUMNS - 1)) * (PLOT_W - PLOT_INSET * 2),
		y:
			(incident.rises ? 72 - badness * 44 : 28 + badness * 44) +
			(pseudoRandom(`${incident.id}-l${index}`) - 0.5) * 5,
		bar: incident.barsRise
			? before
				? 4 + height * 8
				: 38 + height * 44
			: before
				? 50 + height * 30
				: 8 + height * 10,
		before,
	};
};

function IncidentEvidence({ incident }: { incident: Incident }) {
	const series = Array.from({ length: COLUMNS }, (_, index) =>
		pointAt(incident, index)
	);
	const cause = pointAt(incident, incident.split);
	const causeLeft = percent(cause.x, PLOT_W);
	const deployTop = percent(DEPLOY_Y, PLOT_H);
	const lanes = [...incident.lanes, { title: "Deploys", sub: "production" }];
	return (
		<div className="flex flex-1 flex-col gap-5">
			<MomentHeadline
				accent={incident.cause.sha}
				accentAt={LINKED_AT}
				text={`${incident.captionLead} ${incident.cause.sha} ships`}
			/>
			<div className="grid min-h-48 flex-1 grid-cols-[64px_1fr] grid-rows-[20px_1fr] gap-x-3 sm:grid-cols-[140px_1fr] sm:gap-x-6">
				<motion.div
					className="col-start-1 row-start-2 grid grid-rows-3"
					{...enter(0.15, 0)}
				>
					{lanes.map((lane) => (
						<div
							className="flex flex-col justify-center gap-0.5"
							key={lane.title}
						>
							<span className="flex items-center gap-2 font-medium text-foreground text-xs sm:text-base">
								{lane.title === "Deploys" && (
									<SiGithub className="size-3.5 shrink-0" />
								)}
								{lane.title}
							</span>
							<span className="hidden font-mono text-muted-foreground text-xs sm:block">
								{lane.sub}
							</span>
						</div>
					))}
				</motion.div>
				<div className="relative col-start-2 row-start-1">
					<motion.span
						className="absolute top-0 -translate-x-1/2 font-mono text-brand-amber text-xs sm:text-sm"
						style={{ left: causeLeft }}
						{...enter(LINK_AT - 0.15, 4)}
					>
						{incident.cause.time}
					</motion.span>
				</div>
				<div className="relative col-start-2 row-start-2">
					<motion.div
						animate={{ clipPath: "inset(0 0% 0 0)" }}
						className="absolute inset-0"
						initial={{ clipPath: "inset(0 100% 0 0)" }}
						transition={{ delay: 0.2, duration: 1, ease: IN_OUT }}
					>
						<svg
							aria-hidden="true"
							className="absolute inset-0 size-full"
							preserveAspectRatio="none"
							viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
						>
							<path
								className="stroke-foreground/75"
								d={toPath(
									series
										.filter((p) => p.index <= incident.split)
										.map((p) => [p.x, p.y])
								)}
								fill="none"
								strokeWidth={2}
								vectorEffect="non-scaling-stroke"
							/>
							<path
								className="stroke-red-500"
								d={toPath(
									series.filter((p) => !p.before).map((p) => [p.x, p.y])
								)}
								fill="none"
								strokeWidth={2.5}
								vectorEffect="non-scaling-stroke"
							/>
							{[BAR_BASE, DEPLOY_Y].map((y) => (
								<line
									className="stroke-border"
									key={y}
									vectorEffect="non-scaling-stroke"
									x1={0}
									x2={PLOT_W}
									y1={y}
									y2={y}
								/>
							))}
							{series.map((p) => (
								<rect
									className={
										p.before ? "fill-muted-foreground/40" : "fill-red-500"
									}
									height={p.bar}
									key={p.index}
									width={10}
									x={p.x - 5}
									y={BAR_BASE - p.bar}
								/>
							))}
						</svg>
						{[80, 200].map((x) => (
							<span
								className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-muted-foreground/40"
								key={x}
								style={{ left: percent(x, PLOT_W), top: deployTop }}
							/>
						))}
						<span
							className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-brand-amber"
							style={{ left: causeLeft, top: deployTop }}
						/>
					</motion.div>
					<motion.span
						animate={{ scaleY: 1 }}
						className="absolute inset-y-0 w-0.5 origin-top -translate-x-1/2 bg-brand-amber"
						initial={{ scaleY: 0 }}
						style={{
							left: causeLeft,
							filter: "drop-shadow(0 0 6px var(--brand-amber))",
						}}
						transition={{
							delay: LINK_AT,
							duration: LINK_SECONDS,
							ease: IN_OUT,
						}}
					/>
					{[cause.y, BAR_BASE - cause.bar, DEPLOY_Y].map((y) => (
						<motion.span
							animate={{ scale: 1 }}
							className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-amber"
							initial={{ scale: 0 }}
							key={y}
							style={{ left: causeLeft, top: percent(y, PLOT_H) }}
							transition={{
								delay: LINK_AT + LINK_SECONDS * (y / PLOT_H),
								duration: 0.3,
								ease: IN_OUT,
							}}
						/>
					))}
					<motion.span
						className="absolute ml-3 -translate-y-full whitespace-nowrap pb-1.5 font-mono text-foreground text-xs sm:text-sm"
						style={{ left: causeLeft, top: deployTop }}
						{...enter(LINKED_AT, 4)}
					>
						{incident.cause.sha}
						<span className="max-sm:hidden"> {incident.cause.label}</span>
					</motion.span>
				</div>
			</div>
		</div>
	);
}

const sparkFor = (incident: Incident) => {
	const points = Array.from({ length: 40 }, (_, index): [number, number] => {
		let badness = 0.1;
		if (index < 10) {
			badness = 0;
		} else if (index < 14) {
			badness = (index - 10) / 4;
		} else if (index < 24) {
			badness = 1;
		} else if (index < 30) {
			badness = 1 - ((index - 24) / 6) * 0.9;
		}
		const noise = (pseudoRandom(`${incident.id}-s${index}`) - 0.5) * 4;
		return [
			(index / 39) * 560,
			(incident.rises ? 90 - badness * 76 : 14 + badness * 76) + noise,
		];
	});
	return {
		bad: toPath(points.slice(0, 26)),
		recovered: toPath(points.slice(24)),
	};
};

function IncidentAnswer({ incident }: { incident: Incident }) {
	const recovered = useAfter(RECOVERED_AT);
	const spark = sparkFor(incident);
	return (
		<div className="flex flex-1 flex-col gap-5">
			<MomentHeadline sweep text={incident.answer.headline} />
			<div className="flex flex-1 flex-col justify-between gap-6">
				<div className="grid gap-5 md:grid-cols-2 md:gap-10">
					<motion.div className="flex flex-col gap-1.5" {...enter(0.6)}>
						<span className="text-muted-foreground text-sm">Why</span>
						<p className="text-base text-foreground leading-snug md:text-xl">
							{incident.answer.why}
						</p>
					</motion.div>
					<div className="flex gap-4">
						<motion.span
							animate={{ scaleY: 1 }}
							className="w-1 shrink-0 origin-top self-stretch bg-brand-amber"
							initial={{ scaleY: 0 }}
							transition={{ delay: 1.1, duration: 0.5, ease: IN_OUT }}
						/>
						<motion.div className="flex flex-col gap-1.5" {...enter(1.25)}>
							<span className="text-brand-amber text-sm">Do this next</span>
							<span className="font-medium text-foreground text-lg leading-snug tracking-tight md:text-2xl">
								{incident.answer.next}
							</span>
						</motion.div>
					</div>
				</div>
				<motion.div
					className="flex items-end justify-between gap-4"
					{...enter(2)}
				>
					<div className="flex min-w-0 flex-col gap-1">
						<span className="text-muted-foreground text-xs sm:text-sm">
							{incident.answer.outcomeLabel}
						</span>
						<AnimatePresence initial={false} mode="wait">
							<motion.span
								animate={{ opacity: 1, y: 0 }}
								className={cn(
									"font-semibold text-xl md:text-2xl",
									recovered ? "text-emerald-500" : "text-muted-foreground"
								)}
								exit={{ opacity: 0, y: -6 }}
								initial={{ opacity: 0, y: 6 }}
								key={recovered ? "recovered" : "watching"}
								transition={{ duration: 0.25, ease: IN_OUT }}
							>
								{recovered ? incident.answer.outcomeValue : "Measuring"}
							</motion.span>
						</AnimatePresence>
					</div>
					<svg
						aria-hidden="true"
						className="h-auto w-2/5 max-w-[440px] shrink-0 sm:w-1/2"
						viewBox="0 0 560 104"
					>
						<motion.path
							animate={{ pathLength: 1 }}
							className="stroke-red-500"
							d={spark.bad}
							fill="none"
							initial={{ pathLength: 0 }}
							strokeWidth={3}
							transition={{ delay: 2.2, duration: 0.6, ease: IN_OUT }}
						/>
						<motion.path
							animate={{ pathLength: 1 }}
							className="stroke-emerald-500"
							d={spark.recovered}
							fill="none"
							initial={{ pathLength: 0 }}
							strokeWidth={3}
							transition={{
								delay: 2.8,
								duration: RECOVERED_AT - 2.8,
								ease: IN_OUT,
							}}
						/>
					</svg>
				</motion.div>
			</div>
		</div>
	);
}

const STAGE_PHASES: {
	label: string;
	status: string;
	seconds: number;
	Moment: FC<{ incident: Incident; live: boolean }>;
}[] = [
	{
		label: "Checks",
		status: "Investigating",
		seconds: 4.2,
		Moment: IncidentScan,
	},
	{
		label: "Evidence",
		status: "Change found",
		seconds: 4.6,
		Moment: IncidentEvidence,
	},
	{
		label: "Next step",
		status: "Posted to #analytics",
		seconds: 7.5,
		Moment: IncidentAnswer,
	},
];

export function InvestigationStage() {
	const ref = useRef<HTMLDivElement>(null);
	const indicator = useId();
	const visible = useInView(ref, { amount: 0.3 });
	const reduce = useReducedMotion();
	const [step, setStep] = useState(0);
	const [live, setLive] = useState(false);
	useEffect(() => {
		if (reduce) {
			setStep(STAGE_PHASES.length - 1);
			return;
		}
		if (!visible) {
			return;
		}
		setLive(true);
		const seconds = STAGE_PHASES[step % STAGE_PHASES.length]?.seconds ?? 4;
		const id = window.setTimeout(
			() => setStep(step + 1),
			(seconds + EXIT_SECONDS) * 1000
		);
		return () => window.clearTimeout(id);
	}, [visible, reduce, step]);
	const position = step % STAGE_PHASES.length;
	const caseStart = step - position;
	const phase = STAGE_PHASES[position];
	const recovered =
		useAfter(RECOVERED_AT + EXIT_SECONDS, step) &&
		position === STAGE_PHASES.length - 1;
	const status = recovered ? "Recovered" : phase?.status;
	const incident = pick(INCIDENTS, Math.floor(step / STAGE_PHASES.length));
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<ol className="grid grid-cols-3 divide-x divide-white/[0.06] border-white/[0.06] border-b">
					{STAGE_PHASES.map((item, order) => (
						<li key={item.label}>
							<button
								className="group relative flex h-full w-full cursor-pointer flex-col gap-1 px-3 py-3 text-left sm:flex-row sm:items-baseline sm:gap-2.5 sm:px-5 sm:py-4"
								onClick={() => setStep(caseStart + order)}
								type="button"
							>
								{order === position && (
									<motion.span
										className="absolute inset-x-0 top-0 h-0.5 bg-brand-amber"
										layoutId={indicator}
										transition={{ duration: 0.6, ease: IN_OUT }}
									/>
								)}
								<span
									className={cn(
										"text-[12px] transition-colors duration-500 sm:text-sm",
										order === position
											? "text-foreground"
											: "text-muted-foreground group-hover:text-foreground"
									)}
								>
									{item.label}
								</span>
							</button>
						</li>
					))}
				</ol>
				<div className="flex flex-col gap-6 p-5 sm:p-8">
					<div className="flex items-center justify-between gap-4">
						<div className="flex items-center gap-2.5">
							<motion.div
								animate={{ y: [0, -4, 0] }}
								key={status ?? "idle"}
								transition={{ duration: 0.5, ease: IN_OUT }}
							>
								<Image
									alt=""
									height={22}
									src="/brand/bunny/white.svg"
									unoptimized
									width={22}
								/>
							</motion.div>
							<span className="font-semibold text-foreground text-sm sm:text-base">
								Databunny
							</span>
						</div>
						{status && (
							<StatusLine tone={recovered ? "emerald" : "amber"}>
								{status}
							</StatusLine>
						)}
					</div>
					<div className="grid min-h-[310px] md:min-h-[345px] [&>*]:col-start-1 [&>*]:row-start-1">
						<AnimatePresence initial={false} mode="wait">
							{phase && (
								<motion.div
									className="flex flex-col"
									exit={{
										opacity: 0,
										y: -8,
										transition: { duration: EXIT_SECONDS, ease: IN_OUT },
									}}
									key={step}
								>
									<phase.Moment incident={incident} live={live} />
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}

const WATCHED = [
	{ id: "visitors", label: "Visitors" },
	{ id: "checkout", label: "Checkout funnel" },
	{ id: "errors", label: "Checkout errors" },
	{ id: "lcp", label: "Pricing page LCP" },
	{ id: "revenue", label: "Revenue" },
	{ id: "signups", label: "Signup completion" },
	{ id: "chatgpt", label: "ChatGPT referrals" },
	{ id: "inp", label: "Signup page INP" },
] as const;

interface Breakout {
	change: string;
	good: boolean;
	id: (typeof WATCHED)[number]["id"];
	name: string;
	rises: boolean;
}

const BREAKOUTS: [Breakout, ...Breakout[]] = [
	{
		id: "signups",
		name: "signup completion",
		change: "−18%",
		rises: false,
		good: false,
	},
	{
		id: "revenue",
		name: "revenue",
		change: "+42%",
		rises: true,
		good: true,
	},
	{
		id: "errors",
		name: "checkout errors",
		change: "+3.4×",
		rises: true,
		good: false,
	},
	{
		id: "lcp",
		name: "LCP on /pricing",
		change: "+1.2 s",
		rises: true,
		good: false,
	},
];

const BAND_WINDOW = 24;
const BAND_STEP = 100 / (BAND_WINDOW - 1);
const BAND_START = 40;
const BAND_DAYS = 5;
const BAND_EVENTS = [0.8, 1.4, 2, 2.6, 3.2, 3.9, 5.3] as const;

const bandCenter = (id: string, day: number) =>
	20 + Math.sin((day / 7) * Math.PI * 2 + pseudoRandom(id) * 6) * 5;

const anomalyAt = (id: string, day: number) => {
	const cycle = Math.floor((day - BAND_START - 1) / BAND_DAYS);
	if (cycle < 0) {
		return;
	}
	const breakout = pick(BREAKOUTS, cycle);
	const offset = day - (BAND_START + (cycle + 1) * BAND_DAYS);
	if (breakout.id !== id || offset < -1) {
		return;
	}
	return { breakout, cycle, drift: offset === 0 ? 1 : 0.5 };
};

type BandTone = "calm" | "good" | "bad";

function BandRow({
	id,
	label,
	end,
	cycle,
	dim,
	flagged,
}: {
	id: string;
	label: string;
	end: number;
	cycle: number;
	dim: boolean;
	flagged?: Breakout;
}) {
	const points = Array.from({ length: BAND_WINDOW + 1 }, (_, index) => {
		const day = end - BAND_WINDOW + index;
		const center = bandCenter(id, day);
		const found = anomalyAt(id, day);
		const anomaly = found?.cycle === cycle ? found : undefined;
		const offset = anomaly
			? (anomaly.breakout.rises ? -1 : 1) * 15 * anomaly.drift
			: (pseudoRandom(`${id}-${day}`) - 0.5) * 7;
		const tone: BandTone | undefined = anomaly
			? anomaly.breakout.good
				? "good"
				: "bad"
			: undefined;
		return {
			x: (index - 1) * BAND_STEP,
			center,
			y: center + offset,
			tone,
		};
	});
	const runs: { tone: BandTone; points: [number, number][] }[] = [];
	for (const [index, point] of points.entries()) {
		const previous = points[index - 1];
		if (!previous) {
			continue;
		}
		const tone = point.tone ?? previous.tone ?? "calm";
		const run = runs.at(-1);
		if (run?.tone === tone) {
			run.points.push([point.x, point.y]);
		} else {
			runs.push({
				tone,
				points: [
					[previous.x, previous.y],
					[point.x, point.y],
				],
			});
		}
	}
	const band = `${toPath(points.map((p) => [p.x, p.center - 7]))} L ${[
		...points,
	]
		.reverse()
		.map((p) => `${rounded(p.x)} ${rounded(p.center + 7)}`)
		.join(" L ")} Z`;
	return (
		<div
			className={cn(
				"grid grid-cols-[104px_1fr_48px] items-center gap-3 transition-opacity duration-500 sm:grid-cols-[150px_1fr_60px] sm:gap-4",
				dim && "opacity-50"
			)}
		>
			<span
				className={cn(
					"truncate font-mono text-[11px] transition-colors duration-500 sm:text-xs",
					flagged ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{label}
			</span>
			<div className="relative h-7 sm:h-8">
				<svg
					aria-hidden="true"
					className="absolute inset-0 size-full"
					preserveAspectRatio="none"
					viewBox="0 0 100 40"
				>
					<motion.g
						animate={{ x: 0 }}
						initial={{ x: end === BAND_START ? 0 : BAND_STEP }}
						key={end}
						transition={{ duration: 0.45, ease: IN_OUT }}
					>
						<path className="fill-muted-foreground/10" d={band} />
						{runs.map((run) => (
							<path
								className={cn(
									run.tone === "calm" && "stroke-foreground/60",
									run.tone === "good" && "stroke-emerald-500",
									run.tone === "bad" && "stroke-red-500"
								)}
								d={toPath(run.points)}
								fill="none"
								key={`${run.tone}-${run.points[0]?.[0]}`}
								strokeWidth={run.tone === "calm" ? 1.5 : 2}
								vectorEffect="non-scaling-stroke"
							/>
						))}
					</motion.g>
				</svg>
			</div>
			<span
				className={cn(
					"text-right font-mono text-[11px] transition-colors duration-500 sm:text-xs",
					flagged
						? flagged.good
							? "text-emerald-500"
							: "text-red-500"
						: "text-muted-foreground/70"
				)}
			>
				{flagged ? flagged.change : ""}
			</span>
		</div>
	);
}

export function BaselineBands() {
	const { ref, step, cycle } = useTimeline(BAND_EVENTS, 7.8);
	const breakout = pick(BREAKOUTS, cycle);
	const found = step > BAND_DAYS;
	const opened = step > BAND_DAYS + 1;
	const end = BAND_START + cycle * BAND_DAYS + Math.min(step, BAND_DAYS);
	let status = <StatusLine tone="muted">Daily check at 09:00</StatusLine>;
	if (opened) {
		status = (
			<StatusLine tone="amber">{`Opened an investigation into ${breakout.name}`}</StatusLine>
		);
	} else if (found) {
		status = (
			<StatusLine tone={breakout.good ? "emerald" : "red"}>
				Outside its usual range
			</StatusLine>
		);
	}
	return (
		<MotionConfig reducedMotion="user">
			<div className={cn(FRAME, "flex flex-col gap-5 p-5 sm:p-6")} ref={ref}>
				<div className="flex flex-col gap-2.5">
					{WATCHED.map((metric) => (
						<BandRow
							cycle={cycle}
							dim={found && metric.id !== breakout.id}
							end={end}
							flagged={
								found && metric.id === breakout.id ? breakout : undefined
							}
							id={metric.id}
							key={metric.id}
							label={metric.label}
						/>
					))}
				</div>
				<div className="flex h-5 items-center border-white/[0.06] border-t pt-4">
					{status}
				</div>
			</div>
		</MotionConfig>
	);
}

const WEEK_CHANGES = [
	{
		change: "Visitors −6%",
		verdict: "Normal for a weekday",
		sent: false,
	},
	{
		change: "Errors +12",
		verdict: "3 visitors affected",
		sent: false,
	},
	{
		change: "Revenue +4%",
		verdict: "Within its usual range",
		sent: false,
	},
	{
		change: "Errors +2×",
		verdict: "Already investigating",
		sent: false,
	},
	{
		change: "Signup completion −18%",
		verdict: "#analytics",
		sent: true,
	},
	{
		change: "newsletter_signup −60%",
		verdict: "Low volume",
		sent: false,
	},
	{
		change: "demo_requested −4%",
		verdict: "Small change",
		sent: false,
	},
] as const;
const VERDICT_EVENTS = WEEK_CHANGES.map((_, index) => 0.9 + index * 0.45);

export function ChangeVerdicts() {
	const { ref, step } = useTimeline(VERDICT_EVENTS, 7.2);
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<ul>
					{WEEK_CHANGES.map((row, index) => {
						const done = index < step;
						return (
							<motion.li
								className="relative grid grid-cols-[10px_1fr_auto] items-center gap-3 border-white/[0.04] border-b px-5 py-3 last:border-b-0 sm:gap-4 sm:px-6"
								key={row.change}
							>
								<motion.span
									animate={{ opacity: done && row.sent ? 1 : 0 }}
									className="pointer-events-none absolute inset-0 bg-brand-amber/[0.07]"
									initial={false}
									transition={REWIND}
								/>
								<span className="relative size-2.5 border border-muted-foreground/40">
									<motion.span
										animate={{ scale: done ? 1 : 0 }}
										className={cn(
											"absolute -inset-px",
											row.sent ? "bg-brand-amber" : "bg-muted-foreground/40"
										)}
										initial={false}
										transition={{ duration: 0.3, ease: IN_OUT }}
									/>
								</span>
								<motion.span
									animate={{ opacity: done && !row.sent ? 0.6 : 1 }}
									className="relative text-foreground text-sm"
									initial={false}
									transition={REWIND}
								>
									{row.change}
								</motion.span>
								<span className="relative flex justify-end text-right">
									<AnimatePresence initial={false} mode="wait">
										<motion.span
											animate={{ opacity: 1, x: 0 }}
											className={cn(
												"flex items-center gap-2 text-sm",
												done && row.sent && "text-brand-amber",
												done && !row.sent && "text-muted-foreground",
												!done && "text-muted-foreground/40"
											)}
											exit={{ opacity: 0, x: -6 }}
											initial={{ opacity: 0, x: 6 }}
											key={done ? "verdict" : "pending"}
											transition={{ duration: 0.3, ease: IN_OUT }}
										>
											{done && row.sent && (
												<SlackLogo className="size-3.5 shrink-0" />
											)}
											{done ? row.verdict : ""}
										</motion.span>
									</AnimatePresence>
								</span>
							</motion.li>
						);
					})}
				</ul>
			</div>
		</MotionConfig>
	);
}

const ZOOM = 3.2;
const CAUSE_X = 58;
const COMMITS = [
	{ sha: "b81e0d4", x: 5 },
	{ sha: "0c7a2e9", x: 11 },
	{ sha: "5d19f30", x: 18 },
	{ sha: "a2e8c61", x: 24 },
	{ sha: "91bb7f2", x: 31 },
	{ sha: "3f0d5a8", x: 37 },
	{ sha: "c6e41b0", x: 44 },
	{ sha: "e41c9a2", x: 49, labeled: true },
	{ sha: "8d2f6c1", x: 54, labeled: true },
	{ sha: "a41f0c2", x: CAUSE_X, labeled: true },
	{ sha: "2fd0b17", x: 63, labeled: true },
	{ sha: "6a90d3e", x: 70 },
	{ sha: "f13b8e5", x: 78 },
	{ sha: "4e7c0a9", x: 85 },
	{ sha: "d58a1f6", x: 92 },
] as const;
const COMMIT_EVENTS = [0.9, 1.7, 2.4, 3.4, 3.8] as const;
const zoomed = (x: number) => CAUSE_X + (x - CAUSE_X) * ZOOM;
const CONVERSION = Array.from({ length: 80 }, (_, index): [number, number] => {
	const x = (index / 79) * 1000;
	const fall = Math.min(1, Math.max(0, (x - CAUSE_X * 10 - 6) / 40));
	return [x, 60 + fall * 90 + (pseudoRandom(`conv-${index}`) - 0.5) * 10];
});
const CONVERSION_CUT = CONVERSION.findIndex(([x]) => x > CAUSE_X * 10 + 6);
const DIFF = [
	{ mark: "-", text: "<p>Check your inbox to continue.</p>" },
	{ mark: "+", text: "<p>We sent a verification link to {email}.</p>" },
	{ mark: "+", text: "<p>Open it on this device to finish setting up.</p>" },
] as const;

export function CommitZoom() {
	const { ref, step } = useTimeline(COMMIT_EVENTS, 7.6);
	const flagged = step >= 1;
	const suspect = step >= 2;
	const zoomIn = step >= 3;
	const linked = step >= 4;
	const detailed = step >= 5;
	const zoomTransition = { duration: 0.9, ease: IN_OUT } as const;
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
					<span className="font-medium text-foreground text-sm">
						Signup completion
					</span>
					<span className="flex items-center gap-2 font-mono text-muted-foreground text-xs">
						<SiGithub className="size-3.5" />
						main
					</span>
				</div>
				<div className="relative mx-5 mt-4 sm:mx-6">
					<div className="relative h-32 overflow-hidden sm:h-40">
						<motion.svg
							animate={{
								viewBox: zoomIn
									? `${CAUSE_X * 10 - (CAUSE_X * 10) / ZOOM} 0 ${1000 / ZOOM} 200`
									: "0 0 1000 200",
							}}
							aria-hidden="true"
							className="absolute inset-0 size-full"
							initial={false}
							preserveAspectRatio="none"
							transition={zoomTransition}
						>
							<path
								className="stroke-foreground/70"
								d={toPath(CONVERSION)}
								fill="none"
								strokeWidth={2}
								vectorEffect="non-scaling-stroke"
							/>
							<motion.path
								animate={{ opacity: flagged ? 1 : 0 }}
								className="stroke-red-500"
								d={toPath(CONVERSION.slice(CONVERSION_CUT))}
								fill="none"
								initial={false}
								strokeWidth={2.5}
								transition={REWIND}
								vectorEffect="non-scaling-stroke"
							/>
						</motion.svg>
					</div>
					<div className="relative h-14 overflow-hidden border-white/[0.06] border-t">
						{COMMITS.map((commit) => {
							const cause = commit.x === CAUSE_X;
							return (
								<motion.div
									animate={{ left: `${zoomIn ? zoomed(commit.x) : commit.x}%` }}
									className="absolute top-3 flex -translate-x-1/2 flex-col items-center gap-1.5"
									initial={false}
									key={commit.sha}
									transition={zoomTransition}
								>
									<span
										className={cn(
											"size-2.5 rotate-45 transition-colors duration-500",
											cause && suspect
												? "bg-brand-amber"
												: "bg-muted-foreground/50"
										)}
									/>
									{"labeled" in commit && (
										<motion.span
											animate={{ opacity: zoomIn ? 1 : 0 }}
											className={cn(
												"whitespace-nowrap font-mono text-[10px] sm:text-[11px]",
												cause
													? "text-brand-amber"
													: "text-muted-foreground max-sm:hidden"
											)}
											initial={false}
											transition={REWIND}
										>
											{commit.sha}
										</motion.span>
									)}
								</motion.div>
							);
						})}
					</div>
					<motion.span
						animate={{ scaleY: linked ? 1 : 0 }}
						className="absolute top-0 bottom-9 w-0.5 origin-top -translate-x-1/2 bg-brand-amber"
						initial={false}
						style={{
							left: `${CAUSE_X}%`,
							filter: "drop-shadow(0 0 6px var(--brand-amber))",
						}}
						transition={{ duration: 0.4, ease: IN_OUT }}
					/>
				</div>
				<div className="grid border-white/[0.06] border-t px-5 py-4 sm:px-6 [&>*]:col-start-1 [&>*]:row-start-1">
					<Reveal className="flex flex-col gap-1.5" shown={!detailed}>
						<span className="text-muted-foreground text-sm">
							{COMMITS.length} commits this week
						</span>
					</Reveal>
					<div className="flex flex-col gap-2">
						<Reveal
							className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
							shown={detailed}
						>
							<span className="font-mono text-brand-amber text-xs sm:text-sm">
								a41f0c2
							</span>
							<span className="text-foreground text-sm">
								Update verification email copy
							</span>
							<span className="font-mono text-[11px] text-muted-foreground">
								app/signup/verify.tsx
							</span>
						</Reveal>
						<div className="flex flex-col gap-1 font-mono text-[11px] sm:text-xs">
							{DIFF.map((line, order) => (
								<Reveal
									className="flex min-w-0 gap-3"
									delay={0.2 + order * 0.15}
									key={line.text}
									shown={detailed}
								>
									<span
										className={
											line.mark === "+" ? "text-emerald-500" : "text-red-500"
										}
									>
										{line.mark}
									</span>
									<span className="truncate text-foreground/80">
										{line.text}
									</span>
								</Reveal>
							))}
						</div>
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}

const SLACK_EVENTS = [2.2] as const;

export function SlackThread() {
	const { ref, step } = useTimeline(SLACK_EVENTS, 6.4);
	const replied = step >= 1;
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="flex items-center gap-2 border-white/[0.06] border-b px-5 py-3 sm:px-6">
					<SlackLogo className="size-3.5 text-foreground" />
					<span className="font-mono text-foreground text-xs sm:text-sm">
						#analytics
					</span>
				</div>
				<div className="grid">
					<div className="flex gap-3 px-5 py-5 sm:px-6">
						<Image
							alt=""
							className="mt-0.5 size-7 shrink-0"
							height={28}
							src="/brand/bunny/white.svg"
							unoptimized
							width={28}
						/>
						<div className="flex min-w-0 flex-col gap-1.5">
							<div className="flex items-baseline gap-2">
								<span className="font-semibold text-foreground text-sm">
									Databuddy
								</span>
								<span className="font-mono text-[11px] text-muted-foreground">
									Wed 9:00
								</span>
							</div>
							<p className="font-medium text-foreground text-sm sm:text-base">
								Signup completion fell 18% after Tuesday's copy change
							</p>
							<div className="flex flex-col gap-1 border-white/10 border-l-2 pl-3 text-muted-foreground text-xs sm:text-sm">
								<p>
									<span className="text-foreground/80">Impact:</span> 412 mobile
									visitors stopped at email verification
								</p>
								<p>
									<span className="text-foreground/80">Next:</span> Restore the
									shorter verification copy for mobile
								</p>
							</div>
							<div className="mt-1 flex h-5 items-center gap-2 text-xs">
								<AnimatePresence initial={false} mode="wait">
									<motion.span
										animate={{ opacity: 1, y: 0 }}
										className={
											replied
												? "font-medium text-brand-amber"
												: "text-muted-foreground/50"
										}
										exit={{ opacity: 0, y: -4 }}
										initial={{ opacity: 0, y: 4 }}
										key={replied ? "reply" : "none"}
										transition={{ duration: 0.25, ease: IN_OUT }}
									>
										{replied ? "1 reply" : "No replies"}
									</motion.span>
								</AnimatePresence>
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-3 border-white/[0.06] border-t px-5 py-5 sm:px-6">
						<Reveal className="flex gap-2.5" shown={replied}>
							<Image
								alt=""
								className="mt-0.5 size-5 shrink-0"
								height={20}
								src="/brand/bunny/white.svg"
								unoptimized
								width={20}
							/>
							<div className="flex min-w-0 flex-col gap-1">
								<span className="font-mono text-[11px] text-muted-foreground">
									Fri 9:00
								</span>
								<p className="text-foreground text-sm">
									Signup completion is back to 62% after the shorter copy
									returned.
								</p>
							</div>
						</Reveal>
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}

const FIX_EVENTS = [1.6, 2.2, 4.3] as const;
const MEASURE_SECONDS = 1.8;
const FUNNEL_STEPS = [
	{ path: "/pricing", before: "1,204", after: "1,204" },
	{ path: "/checkout", before: "846", after: "846" },
	{
		path: "/checkout/pay",
		fixed: "/checkout/payment",
		before: "0",
		after: "318",
	},
	{ path: "purchase", before: "0", after: "291" },
] as const;

export function FixVerify() {
	const { ref, step } = useTimeline(FIX_EVENTS, 7.6);
	const applied = step >= 1;
	const measuring = step >= 2;
	const verified = step >= 3;
	let status = <StatusLine tone="muted">Needs review</StatusLine>;
	if (verified) {
		status = (
			<StatusLine tone="emerald">
				Verified: 24% of visitors now complete the funnel
			</StatusLine>
		);
	} else if (applied) {
		status = <StatusLine tone="amber">Measuring</StatusLine>;
	}
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="border-white/[0.06] border-b px-5 py-3 sm:px-6">
					<span className="font-medium text-foreground text-sm">
						Upgrade funnel
					</span>
				</div>
				<ol className="flex flex-col gap-2.5 px-5 py-4 sm:px-6">
					{FUNNEL_STEPS.map((funnelStep, order) => (
						<li
							className="grid grid-cols-[20px_1fr_auto] items-baseline gap-3"
							key={funnelStep.path}
						>
							<span className="font-mono text-muted-foreground text-xs">
								{order + 1}
							</span>
							<span className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-xs sm:text-sm">
								<span
									className={cn(
										"transition-colors duration-300",
										"fixed" in funnelStep && applied
											? "text-muted-foreground line-through decoration-red-500"
											: "text-foreground"
									)}
								>
									{funnelStep.path}
								</span>
								{"fixed" in funnelStep && (
									<motion.span
										animate={
											applied ? { opacity: 1, x: 0 } : { opacity: 0, x: -4 }
										}
										className="text-emerald-500"
										initial={false}
										transition={{ duration: 0.35, ease: IN_OUT }}
									>
										{funnelStep.fixed}
									</motion.span>
								)}
							</span>
							<AnimatePresence initial={false} mode="wait">
								<motion.span
									animate={{ opacity: 1, y: 0 }}
									className={cn(
										"font-mono text-xs tabular-nums sm:text-sm",
										!verified && funnelStep.before === "0"
											? "text-red-500"
											: "text-foreground"
									)}
									exit={{ opacity: 0, y: -4 }}
									initial={{ opacity: 0, y: 4 }}
									key={verified ? "after" : "before"}
									transition={{ duration: 0.25, ease: IN_OUT }}
								>
									{verified ? funnelStep.after : funnelStep.before}
								</motion.span>
							</AnimatePresence>
						</li>
					))}
				</ol>
				<div className="mx-5 flex gap-4 border-white/[0.06] border-t py-4 sm:mx-6">
					<span className="w-1 shrink-0 self-stretch bg-brand-amber" />
					<div className="flex min-w-0 flex-col gap-2">
						<p className="text-foreground text-sm">
							Step 3 points at /checkout/pay, which stopped getting traffic when
							checkout moved to /checkout/payment.
						</p>
						<motion.span
							animate={applied ? { scale: [1, 0.94, 1] } : { scale: 1 }}
							className={cn(
								"mt-1 w-fit px-3 py-1.5 font-medium text-xs transition-colors duration-300",
								applied
									? "bg-white/[0.06] text-muted-foreground"
									: "bg-foreground text-background"
							)}
							initial={false}
							transition={{ duration: 0.3, ease: IN_OUT }}
						>
							{applied ? "Applied" : "Apply fix"}
						</motion.span>
					</div>
				</div>
				<div className="flex flex-col gap-2 border-white/[0.06] border-t px-5 py-4 sm:px-6">
					<div className="relative h-1 bg-white/[0.06]">
						<motion.span
							animate={{ scaleX: measuring ? 1 : 0 }}
							className={cn(
								"absolute inset-0 origin-left transition-colors duration-300",
								verified ? "bg-emerald-500" : "bg-brand-amber"
							)}
							initial={false}
							transition={
								measuring ? { duration: MEASURE_SECONDS, ease: IN_OUT } : REWIND
							}
						/>
					</div>
					<div className="flex h-5 items-center">{status}</div>
				</div>
			</div>
		</MotionConfig>
	);
}

const QUESTION = "Which referrers brought paying customers last month?";
const TOOL_STEPS = ["revenue by referrer, last 30 days"] as const;
const CHAT_EVENTS = [0.9, 1.6, 2.6, 3.1, 4.1] as const;
const SQL = [
	"SELECT referrer_name AS name,",
	"       sumIf(amount, type != 'refund') AS revenue,",
	"       uniq(r_customer_id) AS customers",
	"FROM referrer_agg",
	"WHERE created >= now() - INTERVAL 30 DAY",
	"GROUP BY name ORDER BY revenue DESC",
] as const;
function OpenaiLogo({ className }: { className?: string }) {
	return (
		<Image
			alt=""
			className={cn("invert", className)}
			height={14}
			src="/social/openai.svg"
			unoptimized
			width={14}
		/>
	);
}

const REFERRERS = [
	{
		name: "news.ycombinator.com",
		Logo: SiYcombinator,
		customers: 38,
		revenue: 4180,
	},
	{ name: "google.com", Logo: SiGoogle, customers: 21, revenue: 2310 },
	{ name: "chatgpt.com", Logo: OpenaiLogo, customers: 9, revenue: 1340 },
	{ name: "x.com", Logo: SiX, customers: 12, revenue: 1020 },
] as const;

export function ChatQuery() {
	const { ref, step } = useTimeline(CHAT_EVENTS, 8.2);
	const queried = step >= 2;
	const tabled = step >= 3;
	const charted = step >= 4;
	const answered = step >= 5;
	const top = REFERRERS[0]?.revenue ?? 1;
	return (
		<MotionConfig reducedMotion="user">
			<div
				className={cn(
					FRAME,
					"flex min-h-[450px] flex-col gap-5 p-5 sm:min-h-[470px] sm:p-6 lg:min-h-[510px]"
				)}
				ref={ref}
			>
				<div className="flex flex-col gap-1.5">
					<span className="text-muted-foreground text-xs">You</span>
					<p className="text-foreground text-sm sm:text-base">{QUESTION}</p>
				</div>
				<div className="flex flex-col gap-2.5">
					<div className="flex items-center justify-between gap-2">
						<span className="flex items-center gap-2">
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
					</div>
					{TOOL_STEPS.map((label, order) => (
						<div className="flex flex-col gap-2" key={label}>
							<div className="flex items-center gap-2.5 font-mono text-[11px] sm:text-xs">
								<span
									className={cn(
										"size-2 shrink-0 transition-colors duration-300",
										step > order ? "bg-emerald-500" : "bg-brand-amber"
									)}
								/>
								<span className="text-foreground">get_data</span>
								<span className="truncate text-muted-foreground">{label}</span>
								{order === 0 && (
									<span
										className={cn(
											"ml-auto shrink-0 transition-colors duration-300",
											queried ? "text-foreground" : "text-muted-foreground"
										)}
									>
										View query
									</span>
								)}
							</div>
							{order === 0 && (
								<motion.div
									animate={
										queried
											? { height: "auto", opacity: 1 }
											: { height: 0, opacity: 0 }
									}
									className="overflow-hidden"
									initial={false}
									transition={{ duration: 0.5, ease: IN_OUT }}
								>
									<div className="flex flex-col border-white/10 border-l-2 py-1 pl-3 font-mono text-[10px] text-muted-foreground sm:text-[11px]">
										{SQL.map((line) => (
											<span className="truncate whitespace-pre" key={line}>
												{line}
											</span>
										))}
									</div>
								</motion.div>
							)}
						</div>
					))}
				</div>
				<div className="flex flex-col gap-1.5">
					{REFERRERS.map((row, order) => (
						<div
							className="relative grid grid-cols-[1fr_auto_auto] gap-4 px-2 py-1.5 font-mono text-[11px] sm:text-xs"
							key={row.name}
						>
							<motion.span
								animate={{ opacity: tabled ? 0 : 1 }}
								className="absolute inset-0 bg-white/[0.03]"
								initial={false}
								transition={REWIND}
							/>
							<motion.span
								animate={{ scaleX: charted ? row.revenue / top : 0 }}
								className={cn(
									"absolute inset-0 origin-left",
									order === 0 ? "bg-brand-amber/20" : "bg-white/[0.05]"
								)}
								initial={false}
								transition={
									charted
										? { delay: order * 0.08, duration: 0.6, ease: IN_OUT }
										: REWIND
								}
							/>
							<motion.span
								animate={{ opacity: tabled ? 1 : 0 }}
								className="relative col-span-3 grid grid-cols-subgrid"
								initial={false}
								transition={
									tabled
										? { delay: order * 0.06, duration: 0.35, ease: IN_OUT }
										: REWIND
								}
							>
								<span className="flex min-w-0 items-center gap-2 text-foreground">
									<row.Logo className="size-3.5 shrink-0" />
									<span className="truncate">{row.name}</span>
								</span>
								<span className="text-foreground tabular-nums">
									{row.customers}
								</span>
								<span className="text-muted-foreground tabular-nums">
									${row.revenue.toLocaleString("en-US")}
								</span>
							</motion.span>
						</div>
					))}
				</div>
				<div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
					<motion.div
						animate={{ opacity: answered ? 0 : 1 }}
						className="flex flex-col gap-2 pt-1"
						initial={false}
						transition={REWIND}
					>
						<span className="h-3 w-full bg-white/[0.04]" />
						<span className="h-3 w-2/3 bg-white/[0.04]" />
					</motion.div>
					<Reveal shown={answered}>
						<p className="text-foreground text-sm sm:text-base">
							Hacker News brought{" "}
							<span className="text-brand-amber">
								38 paying customers and $4,180
							</span>{" "}
							last month, more than Google and ChatGPT combined.
						</p>
					</Reveal>
				</div>
			</div>
		</MotionConfig>
	);
}
