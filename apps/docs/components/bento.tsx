"use client";

import { ArrowRightIcon } from "@databuddy/ui/icons";
import {
	MotionConfig,
	motion,
	useInView,
	useReducedMotion,
} from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SectionBullet } from "./icons/section-bullet";
import { IN_OUT } from "./landing/demo-primitives";
import { NavLink } from "./nav-link";

const FUNNEL_STEPS = [
	{ label: "Viewed pricing", count: 1240 },
	{ label: "Started signup", count: 418 },
	{ label: "Verified email", count: 301 },
	{ label: "Created project", count: 214 },
];

const STEP_CONVERSIONS = FUNNEL_STEPS.slice(1).map((step, index) =>
	Math.round((step.count / (FUNNEL_STEPS[index]?.count ?? step.count)) * 100)
);
const WORST_CONVERSION = Math.min(...STEP_CONVERSIONS);

const LIVE_VISITORS = [38, 41, 40, 44, 47, 46, 52, 55, 53, 58, 61, 64];
const SPARK_POINTS = 8;

const SOURCES = [
	{ label: "news.ycombinator.com", share: 41 },
	{ label: "x.com", share: 27 },
	{ label: "acme.link/launch", share: 18 },
	{ label: "Direct", share: 14 },
];

const TONES = {
	good: "bg-emerald-400",
	warn: "bg-brand-amber",
	bad: "bg-red-400",
} as const;

const HEALTH: {
	detail: string;
	label: string;
	tone: keyof typeof TONES;
}[] = [
	{ label: "Uptime", detail: "api.acme.dev up, 182 ms", tone: "good" },
	{ label: "Errors", detail: "TypeError on /checkout, 12 users", tone: "bad" },
	{ label: "Web Vitals", detail: "INP 284 ms p75 on /signup", tone: "warn" },
];

const JOURNEY = [
	{ event: "signed_up", when: "Mon 09:14" },
	{ event: "project_created", when: "Mon 09:31" },
	{ event: "teammate_invited", when: "Tue 14:02" },
	{ event: "plan_upgraded", when: "Thu 11:47" },
];

const FLAGS = [
	{ key: "new-onboarding", rollout: 25 },
	{ key: "checkout-redesign", rollout: 100 },
	{ key: "pricing-v2", rollout: 0 },
];

interface CardLink {
	href: string;
	label: string;
	navItem: string;
}

function BentoCard({
	answer,
	children,
	className,
	eyebrow,
	links,
	title,
}: {
	answer: string;
	children: ReactNode;
	className?: string;
	eyebrow: string;
	links: CardLink[];
	title: string;
}) {
	return (
		<div
			className={cn("flex flex-col gap-8 bg-background p-6 sm:p-8", className)}
		>
			<div>
				<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
					{eyebrow}
				</p>
				<h3 className="mt-3 text-balance font-semibold text-foreground text-xl tracking-tight sm:text-2xl">
					{title}
				</h3>
				<p className="mt-2 max-w-md text-pretty text-muted-foreground text-sm leading-relaxed sm:text-base">
					{answer}
				</p>
			</div>
			<div className="flex-1">{children}</div>
			<div className="flex flex-wrap gap-x-5 gap-y-2">
				{links.map((link) => (
					<NavLink
						className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors duration-200 ease-in-out hover:text-foreground"
						href={link.href}
						key={link.href}
						navItem={link.navItem}
						section="landing"
					>
						{link.label}
						<ArrowRightIcon className="size-3.5" />
					</NavLink>
				))}
			</div>
		</div>
	);
}

function FunnelView() {
	const top = FUNNEL_STEPS[0]?.count ?? 1;
	return (
		<div>
			<ol className="space-y-4">
				{FUNNEL_STEPS.map((step, index) => {
					const conversion = index > 0 ? STEP_CONVERSIONS[index - 1] : null;
					const worst = conversion === WORST_CONVERSION;
					return (
						<li key={step.label}>
							<div className="mb-2 flex items-baseline justify-between gap-3 font-mono text-xs sm:text-sm">
								<span className="text-foreground/85">{step.label}</span>
								<span className="text-muted-foreground tabular-nums">
									{step.count.toLocaleString("en-US")}
									{conversion === null ? null : (
										<span
											className={cn(
												"ml-3 inline-block w-10 text-right",
												worst && "text-brand-amber"
											)}
										>
											{conversion}%
										</span>
									)}
								</span>
							</div>
							<div className="h-2 bg-white/[0.04]">
								<motion.div
									className={cn(
										"h-full",
										worst ? "bg-brand-amber/70" : "bg-foreground/25"
									)}
									initial={{ width: 0 }}
									transition={{
										delay: index * 0.1,
										duration: 0.8,
										ease: IN_OUT,
									}}
									viewport={{ once: true, amount: 0.6 }}
									whileInView={{ width: `${(step.count / top) * 100}%` }}
								/>
							</div>
						</li>
					);
				})}
			</ol>
			<p className="mt-6 font-mono text-brand-amber text-xs">
				Biggest drop: Viewed pricing to Started signup
			</p>
		</div>
	);
}

function LaunchView() {
	const ref = useRef<HTMLDivElement>(null);
	const visible = useInView(ref, { amount: 0.4 });
	const reduce = useReducedMotion();
	const [tick, setTick] = useState(0);

	useEffect(() => {
		if (!visible || reduce) {
			return;
		}
		const id = window.setInterval(() => setTick((value) => value + 1), 2000);
		return () => window.clearInterval(id);
	}, [visible, reduce]);

	const recent = Array.from(
		{ length: SPARK_POINTS },
		(_, index) =>
			LIVE_VISITORS[(tick + index) % LIVE_VISITORS.length] ??
			LIVE_VISITORS[0] ??
			0
	);
	const sparkPath = recent
		.map(
			(value, index) =>
				`${index === 0 ? "M" : "L"}${Math.round((index / (SPARK_POINTS - 1)) * 120)} ${Math.round(44 - ((value - 30) / 40) * 40)}`
		)
		.join(" ");

	return (
		<div className="space-y-6" ref={ref}>
			<div className="flex items-end justify-between gap-6">
				<div>
					<span className="flex items-center gap-2 font-mono text-[11px] text-emerald-400 uppercase tracking-widest">
						<span className="size-1.5 rounded-full bg-emerald-400" />
						Live now
					</span>
					<span className="mt-1 block font-semibold text-3xl text-foreground tabular-nums">
						{recent.at(-1)}
					</span>
				</div>
				<svg
					aria-hidden="true"
					className="h-12 w-32 text-foreground/40"
					fill="none"
					viewBox="0 0 120 48"
				>
					<motion.path
						animate={{ d: sparkPath }}
						initial={false}
						stroke="currentColor"
						strokeWidth={1.5}
						transition={{ duration: 0.6, ease: IN_OUT }}
					/>
				</svg>
			</div>
			<ul className="space-y-3">
				{SOURCES.map((source) => (
					<li key={source.label}>
						<div className="mb-1.5 flex justify-between font-mono text-xs">
							<span className="text-foreground/85">{source.label}</span>
							<span className="text-muted-foreground tabular-nums">
								{source.share}%
							</span>
						</div>
						<div className="h-1.5 bg-white/[0.04]">
							<div
								className="h-full bg-foreground/25"
								style={{ width: `${source.share}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

function HealthView() {
	return (
		<ul className="divide-y divide-white/[0.06] border-white/[0.06] border-y">
			{HEALTH.map((item) => (
				<li
					className="flex items-center gap-3 py-3.5 font-mono text-xs"
					key={item.label}
				>
					<span
						className={cn("size-2 shrink-0 rounded-full", TONES[item.tone])}
					/>
					<span className="w-20 shrink-0 text-foreground/85">{item.label}</span>
					<span className="truncate text-muted-foreground">{item.detail}</span>
				</li>
			))}
		</ul>
	);
}

function JourneyView() {
	return (
		<div>
			<div className="mb-5 flex items-center gap-3">
				<span className="flex size-8 items-center justify-center rounded-full border border-border bg-white/[0.04] font-medium text-foreground text-xs">
					A
				</span>
				<div className="font-mono text-xs">
					<p className="text-foreground/85">Acme Inc</p>
					<p className="text-muted-foreground">plan: pro_trial</p>
				</div>
			</div>
			<ol className="relative space-y-3 border-white/[0.08] border-l pl-5">
				{JOURNEY.map((step) => (
					<li
						className="relative flex justify-between gap-3 font-mono text-xs"
						key={step.event}
					>
						<span className="absolute top-1.5 -left-[23.5px] size-1.5 rounded-full bg-foreground/40" />
						<span className="text-foreground/85">{step.event}</span>
						<span className="text-muted-foreground">{step.when}</span>
					</li>
				))}
			</ol>
		</div>
	);
}

function FlagsView() {
	return (
		<ul className="space-y-4">
			{FLAGS.map((flag) => (
				<li key={flag.key}>
					<div className="mb-1.5 flex justify-between font-mono text-xs">
						<span className="text-foreground/85">{flag.key}</span>
						<span className="text-muted-foreground tabular-nums">
							{flag.rollout === 0 ? "off" : `${flag.rollout}%`}
						</span>
					</div>
					<div className="h-1.5 bg-white/[0.04]">
						<div
							className="h-full bg-foreground/25"
							style={{ width: `${flag.rollout}%` }}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}

export default function Bento() {
	return (
		<MotionConfig reducedMotion="user">
			<div className="w-full">
				<div className="mb-12 text-start lg:mb-16">
					<h2 className="mx-auto flex max-w-4xl items-start gap-2 text-balance font-semibold text-2xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
						<span className="mt-1.5 hidden sm:block">
							<SectionBullet color="#E3A514" />
						</span>
						<span className="text-foreground">
							Answer the questions you open analytics for.
						</span>
					</h2>
					<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
						Where signups drop, whether a launch worked, what broke, and who is
						getting value. Each card below is a view you get in the dashboard.
					</p>
				</div>

				<div className="grid gap-px border border-white/[0.06] bg-white/[0.06] md:grid-cols-2 lg:grid-cols-12">
					<BentoCard
						answer="See each step's conversion and the step losing the most people."
						className="md:col-span-2 lg:col-span-7"
						eyebrow="Funnels"
						links={[
							{
								href: "/demo",
								label: "Try it in the demo",
								navItem: "funnels",
							},
						]}
						title="Where do signups drop off?"
					>
						<FunnelView />
					</BentoCard>
					<BentoCard
						answer="Watch visitors arrive live and see which post or link sent them."
						className="lg:col-span-5"
						eyebrow="Real-time and sources"
						links={[{ href: "/links", label: "Short links", navItem: "links" }]}
						title="Did the launch land?"
					>
						<LaunchView />
					</BentoCard>
					<BentoCard
						answer="Errors, downtime, and slow pages show up next to the traffic they affect."
						className="lg:col-span-4"
						eyebrow="Errors, uptime, web vitals"
						links={[
							{ href: "/errors", label: "Errors", navItem: "errors" },
							{ href: "/uptime", label: "Uptime", navItem: "uptime" },
							{
								href: "/web-vitals",
								label: "Web Vitals",
								navItem: "web_vitals",
							},
						]}
						title="Is anything broken?"
					>
						<HealthView />
					</BentoCard>
					<BentoCard
						answer="Follow what each signed-up account does, from first visit to upgrade."
						className="lg:col-span-4"
						eyebrow="Events and profiles"
						links={[
							{
								href: "/docs/sdk/identify-users",
								label: "Identify users",
								navItem: "identify_users",
							},
						]}
						title="Who is getting value?"
					>
						<JourneyView />
					</BentoCard>
					<BentoCard
						answer="Roll features out by percentage and turn them off without a deploy."
						className="lg:col-span-4"
						eyebrow="Feature flags"
						links={[
							{
								href: "/feature-flags",
								label: "Feature flags",
								navItem: "feature_flags",
							},
						]}
						title="Can I ship to a few people first?"
					>
						<FlagsView />
					</BentoCard>
				</div>
			</div>
		</MotionConfig>
	);
}
