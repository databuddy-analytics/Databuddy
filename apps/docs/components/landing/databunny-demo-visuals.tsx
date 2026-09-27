"use client";

import {
	ArrowRightIcon,
	ArrowUpIcon,
	ArrowDownIcon,
	BugIcon,
	ChartLineUpIcon,
	EyeIcon,
	LightbulbIcon,
	LightningIcon,
	RobotIcon,
	TrendUpIcon,
	TrendDownIcon,
	TriangleWarningIcon,
} from "@databuddy/ui/icons";
import {
	AnimatePresence,
	MotionConfig,
	motion,
	useInView,
	useReducedMotion,
} from "motion/react";
import Image from "next/image";
import { type FC, useEffect, useId, useRef, useState } from "react";
import {
	BottomFade,
	CardChrome,
	useRevealOnScroll,
} from "@/components/landing/demo-primitives";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/demo-constants";

const CHAT_MESSAGES = [
	{
		role: "user" as const,
		text: "What caused the traffic spike last Tuesday?",
	},
	{
		role: "assistant" as const,
		text: "Your /pricing page saw a 340% traffic increase on Tuesday between 2–5 PM. The spike was driven by a Hacker News post linking to your launch announcement. 68% of visitors were new, primarily from the US and Germany.",
	},
	{
		role: "user" as const,
		text: "How did those visitors convert?",
	},
	{
		role: "assistant" as const,
		text: "12.4% signed up (vs. your 4.1% baseline). The /pricing → /signup funnel had a 3x higher completion rate than organic traffic. Most churned visitors dropped off at the email verification step.",
	},
] as const;

export function AgentChatDemo() {
	const { ref, visible } = useRevealOnScroll();

	return (
		<div aria-hidden className="relative mt-3 w-full overflow-hidden" ref={ref}>
			<div className="space-y-3">
				<div className="flex items-center gap-2.5 pb-1">
					<div className="flex size-7 items-center justify-center rounded bg-violet-500/15">
						<RobotIcon className="size-3.5 text-violet-400" />
					</div>
					<span className="font-medium text-foreground text-sm">Databunny</span>
					<span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
						online
					</span>
				</div>

				{CHAT_MESSAGES.map((msg, i) => (
					<div
						className={cn(
							"transition-all duration-500",
							visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
						)}
						key={i}
						style={{
							transitionDelay: visible ? `${i * 120}ms` : "0ms",
							transitionTimingFunction: EASE,
						}}
					>
						{msg.role === "user" ? (
							<div className="flex justify-end">
								<div className="max-w-[85%] rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
									<p className="font-medium text-foreground text-xs leading-relaxed sm:text-sm">
										{msg.text}
									</p>
								</div>
							</div>
						) : (
							<div className="max-w-[90%]">
								<p className="font-medium text-muted-foreground text-xs leading-relaxed sm:text-sm">
									{msg.text}
								</p>
							</div>
						)}
					</div>
				))}
			</div>

			<BottomFade />
		</div>
	);
}

const SUGGESTED_PROMPTS = [
	{
		icon: LightbulbIcon,
		label: "Why did signups drop this week?",
		source: "From your investigations",
		color: "bg-amber-500/10 text-amber-400",
	},
	{
		icon: ChartLineUpIcon,
		label: "How does this month compare to last?",
		source: "Suggested",
		color: "bg-blue-500/10 text-blue-400",
	},
	{
		icon: BugIcon,
		label: "Which pages have the most errors?",
		source: "Suggested",
		color: "bg-red-500/10 text-red-400",
	},
	{
		icon: LightningIcon,
		label: "What are my top converting events?",
		source: "From your investigations",
		color: "bg-amber-500/10 text-amber-400",
	},
] as const;

export function SuggestedPromptsDemo() {
	const { ref, visible } = useRevealOnScroll();

	return (
		<div aria-hidden className="relative mt-3 w-full overflow-hidden" ref={ref}>
			<div className="grid gap-2 sm:grid-cols-2">
				{SUGGESTED_PROMPTS.map((item, i) => (
					<CardChrome
						className={cn(
							"group flex cursor-default items-start gap-3 p-3 transition-all duration-500",
							visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
						)}
						key={item.label}
					>
						<span
							className={cn(
								"flex size-7 shrink-0 items-center justify-center rounded",
								item.color
							)}
							style={{
								transitionDelay: visible ? `${i * 80}ms` : "0ms",
								transitionTimingFunction: EASE,
							}}
						>
							<item.icon className="size-3.5" />
						</span>
						<span className="min-w-0 flex-1">
							<span className="line-clamp-2 font-medium text-foreground text-xs leading-tight sm:text-sm">
								{item.label}
							</span>
							<span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
								{item.source}
							</span>
						</span>
						<ArrowRightIcon className="mt-0.5 size-3.5 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground" />
					</CardChrome>
				))}
			</div>
		</div>
	);
}

type InsightTone = "positive" | "negative" | "warning";

interface InsightItem {
	change: string;
	description: string;
	icon: typeof TrendUpIcon;
	metric: string;
	metricValue: string;
	title: string;
	tone: InsightTone;
}

const TONE_STYLES: Record<
	InsightTone,
	{ dot: string; text: string; bg: string }
> = {
	positive: {
		dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]",
		text: "text-emerald-400",
		bg: "bg-emerald-500/10",
	},
	negative: {
		dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
		text: "text-red-400",
		bg: "bg-red-500/10",
	},
	warning: {
		dot: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]",
		text: "text-amber-400",
		bg: "bg-amber-500/10",
	},
};

const INSIGHT_ITEMS: InsightItem[] = [
	{
		icon: TrendUpIcon,
		title: "Traffic surge on /pricing",
		description:
			"Pageviews up 340% compared to last week, driven by external referral traffic",
		change: "+340%",
		tone: "positive",
		metric: "Pageviews",
		metricValue: "12,847",
	},
	{
		icon: BugIcon,
		title: "Error rate climbing on /checkout",
		description: "Unhandled exceptions increased 2.8x since yesterday's deploy",
		change: "+180%",
		tone: "negative",
		metric: "Errors",
		metricValue: "847",
	},
	{
		icon: TrendDownIcon,
		title: "Signup conversion dipping",
		description:
			"Free trial signups down 18% week-over-week, primarily on mobile Safari",
		change: "-18%",
		tone: "warning",
		metric: "Signups",
		metricValue: "234",
	},
];

export function InsightCardsDemo() {
	const { ref, visible } = useRevealOnScroll();

	return (
		<div aria-hidden className="relative mt-3 w-full overflow-hidden" ref={ref}>
			<div className="space-y-2 sm:space-y-2.5">
				{INSIGHT_ITEMS.map((item, i) => {
					const tone = TONE_STYLES[item.tone];
					return (
						<CardChrome
							className={cn(
								"p-3 transition-all duration-500 sm:p-3.5",
								visible
									? "translate-y-0 opacity-100"
									: "translate-y-3 opacity-0"
							)}
							key={item.title}
						>
							<div
								style={{
									transitionDelay: visible ? `${i * 100}ms` : "0ms",
									transitionTimingFunction: EASE,
								}}
							>
								<div className="flex gap-2.5">
									<span
										className={cn(
											"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded",
											tone.bg
										)}
									>
										<item.icon className={cn("size-3.5", tone.text)} />
									</span>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex items-start justify-between gap-2">
											<span className="font-medium text-foreground text-xs sm:text-sm">
												{item.title}
											</span>
											<span
												className={cn(
													"shrink-0 font-mono text-xs tabular-nums",
													tone.text
												)}
											>
												{item.change}
											</span>
										</div>
										<p className="font-mono text-[11px] text-muted-foreground leading-snug sm:text-xs">
											{item.description}
										</p>
										<div className="flex items-center gap-3 pt-0.5">
											<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
												{item.metric}
											</span>
											<span className="font-medium text-foreground text-xs tabular-nums">
												{item.metricValue}
											</span>
										</div>
									</div>
								</div>
							</div>
						</CardChrome>
					);
				})}
			</div>

			<BottomFade />
		</div>
	);
}

const PROACTIVE_ALERTS = [
	{
		icon: TriangleWarningIcon,
		title: "Action: /api/auth errors spike after deploy",
		description:
			"Exceptions rose 4.2x versus baseline. Next: roll back the session refactor, then verify recovery",
		time: "Today",
		tone: "danger" as const,
		channel: "Slack #alerts",
	},
	{
		icon: LightbulbIcon,
		title: "Question: did the pricing experiment ship?",
		description:
			"Signup conversion moved with no matching deploy or annotation. One answer unblocks the case",
		time: "Today",
		tone: "info" as const,
		channel: "Slack #insights",
	},
	{
		icon: TrendUpIcon,
		title: "Resolved: signup funnel recovered",
		description:
			"Verified on recheck: completion is back at baseline after the copy fix",
		time: "Yesterday",
		tone: "success" as const,
		channel: "Slack #alerts",
	},
] as const;

const ALERT_TONE = {
	danger: {
		dot: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.65)]",
		icon: "text-red-400",
		badge: "bg-red-500/10 text-red-400",
	},
	info: {
		dot: "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.55)]",
		icon: "text-blue-400",
		badge: "bg-blue-500/10 text-blue-400",
	},
	success: {
		dot: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]",
		icon: "text-emerald-400",
		badge: "bg-emerald-500/10 text-emerald-400",
	},
} as const;

export function ProactiveAlertsDemo() {
	const { ref, visible } = useRevealOnScroll();

	return (
		<div aria-hidden className="relative mt-3 w-full overflow-hidden" ref={ref}>
			<div className="space-y-2 sm:space-y-2.5">
				{PROACTIVE_ALERTS.map((alert, i) => {
					const tone = ALERT_TONE[alert.tone];
					return (
						<CardChrome
							className={cn(
								"p-3 transition-all duration-500 sm:p-3.5",
								visible
									? "translate-y-0 opacity-100"
									: "translate-y-3 opacity-0"
							)}
							key={alert.title}
						>
							<div
								style={{
									transitionDelay: visible ? `${i * 100}ms` : "0ms",
									transitionTimingFunction: EASE,
								}}
							>
								<div className="flex gap-2.5">
									<span
										aria-hidden
										className={cn(
											"mt-1.5 size-2 shrink-0 rounded-full",
											tone.dot,
											i === 0 && "animate-pulse motion-reduce:animate-none"
										)}
									/>
									<div className="min-w-0 flex-1 space-y-1">
										<div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
											<span className="font-medium text-foreground text-xs sm:text-sm">
												{alert.title}
											</span>
											<span className="shrink-0 font-medium text-[11px] text-muted-foreground tabular-nums sm:text-xs">
												{alert.time}
											</span>
										</div>
										<p className="font-mono text-[11px] text-muted-foreground leading-snug sm:text-xs">
											{alert.description}
										</p>
										<span
											className={cn(
												"inline-block rounded-full px-2 py-0.5 font-mono text-[10px]",
												tone.badge
											)}
										>
											{alert.channel}
										</span>
									</div>
								</div>
							</div>
						</CardChrome>
					);
				})}
			</div>

			<BottomFade />
		</div>
	);
}

type AnomalySeverity = "critical" | "warning";
type AnomalyDirection = "spike" | "drop";

interface AnomalyItem {
	baseline: string;
	change: string;
	current: string;
	direction: AnomalyDirection;
	metric: string;
	metricColor: string;
	metricIcon: typeof EyeIcon;
	period: string;
	severity: AnomalySeverity;
}

const SEVERITY_STYLES: Record<AnomalySeverity, string> = {
	critical: "bg-red-500/15 text-red-400",
	warning: "bg-amber-500/15 text-amber-400",
};

const ANOMALY_ITEMS: AnomalyItem[] = [
	{
		metric: "Errors",
		metricIcon: BugIcon,
		metricColor: "bg-red-500/15 text-red-400",
		severity: "critical",
		direction: "spike",
		current: "847",
		baseline: "92",
		change: "+820%",
		period: "Apr 28 vs weekday baseline",
	},
	{
		metric: "Pageviews",
		metricIcon: EyeIcon,
		metricColor: "bg-blue-500/15 text-blue-400",
		severity: "warning",
		direction: "drop",
		current: "1,204",
		baseline: "4,820",
		change: "-75%",
		period: "Apr 27 vs prior Sundays",
	},
	{
		metric: "Custom events",
		metricIcon: LightningIcon,
		metricColor: "bg-violet-500/15 text-violet-400",
		severity: "warning",
		direction: "spike",
		current: "3,412",
		baseline: "890",
		change: "+283%",
		period: "Apr 27 vs prior week",
	},
];

export function AnomalyDetectionDemo() {
	const { ref, visible } = useRevealOnScroll();

	return (
		<div aria-hidden className="relative mt-3 w-full overflow-hidden" ref={ref}>
			<div className="space-y-2 sm:space-y-2.5">
				{ANOMALY_ITEMS.map((item, i) => (
					<CardChrome
						className={cn(
							"p-3 transition-all duration-500 sm:p-3.5",
							visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
						)}
						key={item.metric}
					>
						<div
							style={{
								transitionDelay: visible ? `${i * 100}ms` : "0ms",
								transitionTimingFunction: EASE,
							}}
						>
							<div className="flex items-start gap-2.5">
								<span
									className={cn(
										"flex size-7 shrink-0 items-center justify-center rounded",
										item.metricColor
									)}
								>
									<item.metricIcon className="size-3.5" />
								</span>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-medium text-foreground text-xs sm:text-sm">
											{item.metric}
										</span>
										<span
											className={cn(
												"rounded-full px-1.5 py-0.5 font-mono text-[10px] capitalize",
												SEVERITY_STYLES[item.severity]
											)}
										>
											{item.severity}
										</span>
										<span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground">
											{item.direction === "spike" ? (
												<ArrowUpIcon className="size-2.5 text-red-400" />
											) : (
												<ArrowDownIcon className="size-2.5 text-blue-400" />
											)}
											{item.direction}
										</span>
									</div>
									<div className="mt-1.5 flex items-center gap-4">
										<div>
											<span className="block font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
												Current
											</span>
											<span className="font-medium text-foreground text-xs tabular-nums">
												{item.current}
											</span>
										</div>
										<div>
											<span className="block font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
												Baseline
											</span>
											<span className="font-medium text-muted-foreground text-xs tabular-nums">
												{item.baseline}
											</span>
										</div>
										<span
											className={cn(
												"font-mono text-xs tabular-nums",
												item.direction === "spike"
													? "text-red-400"
													: "text-blue-400"
											)}
										>
											{item.change}
										</span>
									</div>
									<span className="mt-1 block font-mono text-[10px] text-muted-foreground">
										{item.period}
									</span>
								</div>
							</div>
						</div>
					</CardChrome>
				))}
			</div>

			<BottomFade />
		</div>
	);
}

const CASE_TIMELINE = [
	{
		label: "Opened",
		time: "Mon",
		text: "Checkout exceptions rose 2.8x after Tuesday's deploy, concentrated on iOS Safari.",
		tone: "danger" as const,
	},
	{
		label: "Reply",
		time: "Mon",
		text: "alex: Rolled back address autocomplete in v2.14.1.",
		tone: "info" as const,
	},
	{
		label: "Verified",
		time: "Tue",
		text: "Recheck passed: step-two completion is back at baseline. Case resolved.",
		tone: "success" as const,
	},
] as const;

const CASE_TONE = {
	danger: "bg-red-500/15 text-red-400",
	info: "bg-blue-500/15 text-blue-400",
	success: "bg-emerald-500/15 text-emerald-400",
} as const;

export function CaseFollowUpDemo() {
	const { ref, visible } = useRevealOnScroll();

	return (
		<div aria-hidden className="relative mt-3 w-full overflow-hidden" ref={ref}>
			<div className="space-y-2 sm:space-y-2.5">
				{CASE_TIMELINE.map((step, i) => (
					<CardChrome
						className={cn(
							"p-3 transition-all duration-500 sm:p-3.5",
							visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
						)}
						key={step.label}
					>
						<div
							style={{
								transitionDelay: visible ? `${i * 100}ms` : "0ms",
								transitionTimingFunction: EASE,
							}}
						>
							<div className="flex items-start gap-2.5">
								<span
									className={cn(
										"rounded-full px-2 py-0.5 font-mono text-[10px]",
										CASE_TONE[step.tone]
									)}
								>
									{step.label}
								</span>
								<p className="min-w-0 flex-1 font-mono text-[11px] text-muted-foreground leading-snug sm:text-xs">
									{step.text}
								</p>
								<span className="shrink-0 font-medium text-[11px] text-muted-foreground tabular-nums">
									{step.time}
								</span>
							</div>
						</div>
					</CardChrome>
				))}
			</div>
		</div>
	);
}

const IN_OUT = [0.65, 0, 0.35, 1] as const;

const INCIDENT_SOURCES = [
	"Sessions",
	"Events",
	"Funnels",
	"Errors",
	"Web Vitals",
	"Deploys",
	"Flags",
] as const;
type IncidentSource = (typeof INCIDENT_SOURCES)[number];

const QUIET_RESULTS: Record<IncidentSource, string> = {
	Sessions: "traffic normal",
	Events: "no tracking gaps",
	Funnels: "no drop-off",
	Errors: "no new errors",
	"Web Vitals": "normal",
	Deploys: "no deploys",
	Flags: "no changes",
};

interface IncidentLane {
	sub: string;
	title: string;
}

export interface Incident {
	answer: {
		headline: string;
		next: string;
		outcomeLabel: string;
		outcomeValue: string;
		why: string;
	};
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

export const INCIDENTS: Incident[] = [
	{
		id: "checkout",
		metric: "Checkout conversion",
		change: "−37%",
		findings: {
			Funnels: "payment step −31% · iOS Safari",
			Errors: "TypeError spike · /checkout/shipping",
		},
		lanes: [
			{ title: "Funnels", sub: "payment step · iOS Safari" },
			{ title: "Errors", sub: "/checkout/shipping" },
		],
		cause: { sha: "7c2e9f1", label: "address autocomplete", time: "13:58" },
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
		id: "signup",
		metric: "Signup completion",
		change: "−18%",
		findings: {
			Sessions: "rage clicks · /signup/verify",
			Funnels: "verify step −31% · mobile",
		},
		lanes: [
			{ title: "Funnels", sub: "verify step · mobile" },
			{ title: "Sessions", sub: "rage clicks · /signup/verify" },
		],
		cause: { sha: "a41f0c2", label: "verification copy", time: "09:12" },
		captionLead: "Mobile drop-off starts the minute",
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
		id: "inp",
		metric: "Signup INP, p75",
		change: "+42%",
		findings: {
			Funnels: "plan step −12% · /signup",
			"Web Vitals": "INP 284 ms p75 · /signup",
		},
		lanes: [
			{ title: "Web Vitals", sub: "INP p75 · /signup" },
			{ title: "Long tasks", sub: "plan selector" },
		],
		cause: { sha: "e90b7d4", label: "pricing calculator", time: "16:40" },
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

const pseudoRandom = (seed: string) => {
	let total = 0;
	for (const [position, char] of [...seed].entries()) {
		total += char.charCodeAt(0) * (position + 1) * 31;
	}
	const value = Math.sin(total) * 10_000;
	return value - Math.floor(value);
};

const checksFor = (incident: Incident) =>
	INCIDENT_SOURCES.map((name, order) => {
		const finding =
			name === "Deploys"
				? `${incident.cause.sha} · ${incident.cause.label} · ${incident.cause.time}`
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

const withDots = (text: string) =>
	text
		.split("·")
		.map((part, position) => ({ part, position }))
		.flatMap(({ part, position }) =>
			position === 0
				? [part]
				: [
						<span className="font-sans" key={position}>
							·
						</span>,
						part,
					]
		);

const toPath = (points: [number, number][]) =>
	`M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")}`;

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

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

const useFinishedChecks = (incident: Incident) => {
	const [finished, setFinished] = useState<string[]>([]);
	useEffect(() => {
		const ids = checksFor(incident).map((check) =>
			window.setTimeout(
				() => setFinished((names) => [...names, check.name]),
				check.finish * 1000
			)
		);
		return () => {
			for (const id of ids) {
				window.clearTimeout(id);
			}
		};
	}, [incident]);
	return finished;
};

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

export function IncidentScan({ incident }: { incident: Incident }) {
	const checks = checksFor(incident);
	const finished = useFinishedChecks(incident);
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
									"font-medium text-sm transition-colors duration-300 sm:text-base",
									found ? "text-foreground" : "text-muted-foreground"
								)}
							>
								{check.name}
							</span>
							<span className="relative hidden h-0.5 bg-border md:block">
								<motion.span
									animate={{ scaleX: 1 }}
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
									"font-mono text-xs sm:text-sm",
									check.hit ? "text-foreground" : "text-muted-foreground/60"
								)}
								initial={false}
								transition={{ duration: 0.35, ease: IN_OUT }}
							>
								{withDots(check.result)}
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
		bar: before ? 4 + height * 8 : 38 + height * 44,
		before,
	};
};

export function IncidentEvidence({ incident }: { incident: Incident }) {
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
							<span className="font-medium text-foreground text-xs sm:text-base">
								{lane.title}
							</span>
							<span className="hidden font-mono text-muted-foreground text-xs sm:block">
								{withDots(lane.sub)}
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

export function IncidentAnswer({ incident }: { incident: Incident }) {
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
								{recovered ? incident.answer.outcomeValue : "Watching the fix"}
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
	Moment: FC<{ incident: Incident }>;
}[] = [
	{
		label: "Checks every source",
		status: "Investigating",
		seconds: 4.2,
		Moment: IncidentScan,
	},
	{
		label: "Finds the cause",
		status: "Cause found",
		seconds: 4.6,
		Moment: IncidentEvidence,
	},
	{
		label: "Tells you what to fix",
		status: "Posted to #eng-alerts",
		seconds: 7.5,
		Moment: IncidentAnswer,
	},
];

export function InvestigationStage() {
	const ref = useRef<HTMLDivElement>(null);
	const indicator = useId();
	const visible = useInView(ref, { amount: 0.3 });
	const reduce = useReducedMotion();
	const [step, setStep] = useState<number | null>(null);
	useEffect(() => {
		if (!visible) {
			return;
		}
		if (step === null) {
			setStep(reduce ? STAGE_PHASES.length - 1 : 0);
			return;
		}
		if (reduce) {
			return;
		}
		const seconds = STAGE_PHASES[step % STAGE_PHASES.length]?.seconds ?? 4;
		const id = window.setTimeout(
			() => setStep(step + 1),
			(seconds + EXIT_SECONDS) * 1000
		);
		return () => window.clearTimeout(id);
	}, [visible, reduce, step]);
	const position = step === null ? -1 : step % STAGE_PHASES.length;
	const caseStart = step === null ? 0 : step - position;
	const phase = STAGE_PHASES[position];
	const recovered =
		useAfter(RECOVERED_AT + EXIT_SECONDS, step) &&
		position === STAGE_PHASES.length - 1;
	const status = recovered ? "Recovered" : phase?.status;
	const incident =
		step === null
			? undefined
			: INCIDENTS[Math.floor(step / STAGE_PHASES.length) % INCIDENTS.length];
	return (
		<MotionConfig reducedMotion="user">
			<div className="border border-white/[0.06] bg-white/[0.02]" ref={ref}>
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
										"font-mono text-xs tabular-nums transition-colors duration-500",
										order === position
											? "text-brand-amber"
											: "text-muted-foreground"
									)}
								>
									{String(order + 1).padStart(2, "0")}
								</span>
								<span
									className={cn(
										"text-xs transition-colors duration-500 sm:text-sm",
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
							<span className="hidden text-muted-foreground text-sm sm:inline">
								Databuddy's AI agent
							</span>
						</div>
						<AnimatePresence initial={false} mode="wait">
							{status && (
								<motion.div
									animate={{ opacity: 1, y: 0 }}
									className={cn(
										"flex items-center gap-2 text-sm",
										recovered ? "text-emerald-500" : "text-brand-amber"
									)}
									exit={{ opacity: 0, y: -4 }}
									initial={{ opacity: 0, y: 4 }}
									key={status}
									transition={{ duration: 0.25, ease: IN_OUT }}
								>
									<span className="size-2 bg-current" />
									{status}
								</motion.div>
							)}
						</AnimatePresence>
					</div>
					<div className="grid min-h-[310px] md:min-h-[345px] [&>*]:col-start-1 [&>*]:row-start-1">
						<AnimatePresence initial={false} mode="wait">
							{phase && incident && (
								<motion.div
									className="flex flex-col"
									exit={{
										opacity: 0,
										y: -8,
										transition: { duration: EXIT_SECONDS, ease: IN_OUT },
									}}
									key={step}
								>
									<phase.Moment incident={incident} />
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}
