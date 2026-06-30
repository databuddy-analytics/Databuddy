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
		source: "From your insights",
		color: "bg-amber-500/10 text-amber-400",
	},
	{
		icon: ChartLineUpIcon,
		label: "Compare this month vs last month",
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
		source: "From your insights",
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
		title: "Anomaly detected: /api/auth error spike",
		description: "Error rate jumped from 0.2% to 4.1% in the last 30 minutes",
		time: "2m ago",
		tone: "danger" as const,
		channel: "Slack #alerts",
	},
	{
		icon: LightbulbIcon,
		title: "Weekly insight: your best performing page",
		description: "/blog/launch-post drove 42% of new signups this week",
		time: "6h ago",
		tone: "info" as const,
		channel: "Email digest",
	},
	{
		icon: TrendUpIcon,
		title: "Goal reached: 1,000 daily active users",
		description: "You hit your DAU target for the first time today",
		time: "1d ago",
		tone: "success" as const,
		channel: "Slack #growth",
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
		period: "Apr 28, 2:00 – 3:30 PM",
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
		period: "Apr 27, 8:00 – 11:00 PM",
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
		period: "Apr 27, 1:00 – 4:00 PM",
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

export function NarrativeSummaryDemo() {
	const { ref, visible } = useRevealOnScroll();

	return (
		<div aria-hidden className="relative mt-3 w-full overflow-hidden" ref={ref}>
			<CardChrome
				className={cn(
					"p-4 transition-all duration-600 sm:p-5",
					visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
				)}
			>
				<div className="flex items-start gap-3">
					<span className="flex size-8 shrink-0 items-center justify-center rounded bg-amber-500/10">
						<LightbulbIcon className="size-4 text-amber-400" />
					</span>
					<div className="min-w-0 flex-1 space-y-2">
						<div className="flex items-center justify-between">
							<span className="font-medium text-foreground text-xs sm:text-sm">
								This week across your sites
							</span>
							<span className="font-mono text-[10px] text-muted-foreground">
								Updated 2h ago
							</span>
						</div>
						<p className="font-mono text-[11px] text-muted-foreground leading-relaxed sm:text-xs">
							Traffic is up 23% week-over-week, led by organic search. Your
							/pricing page is converting 2.4x better than last month after the
							copy change. Error rates are stable except for a brief spike on
							/checkout Tuesday afternoon (resolved). Mobile bounce rate is
							trending down for the third week.
						</p>
					</div>
				</div>
			</CardChrome>
		</div>
	);
}
