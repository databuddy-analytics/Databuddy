"use client";

import {
	CodeIcon,
	LightningIcon,
	RobotIcon,
	ShieldCheckIcon,
	StackIcon,
	WaveformIcon,
} from "@databuddy/ui/icons";
import {
	AnimatePresence,
	motion,
	useInView,
	useReducedMotion,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SectionBullet } from "../icons/section-bullet";
import { FRAME, IN_OUT } from "./demo-primitives";

const TICK_SECONDS = 1.6;
const VISIBLE_ROWS = 6;
const FIRST_SECOND = 9 * 3600 + 41 * 60;

const KIND_STYLES = {
	pageview: "bg-white/[0.06] text-foreground/80",
	event: "bg-violet-500/10 text-violet-400",
	funnel: "bg-orange-500/10 text-orange-400",
	error: "bg-red-500/10 text-red-400",
	vital: "bg-emerald-500/10 text-emerald-400",
	flag: "bg-amber-500/10 text-amber-400",
	link: "bg-pink-500/10 text-pink-400",
	uptime: "bg-sky-500/10 text-sky-400",
} as const;

const STREAM: {
	detail: string;
	kind: keyof typeof KIND_STYLES;
	meta: string;
}[] = [
	{ kind: "pageview", detail: "/pricing", meta: "Chrome · Germany" },
	{ kind: "event", detail: "signup_completed", meta: "plan: pro" },
	{ kind: "vital", detail: "LCP 1.2s on /", meta: "good" },
	{ kind: "error", detail: "TypeError at /checkout", meta: "Safari 18" },
	{ kind: "flag", detail: "new-onboarding on", meta: "25% of users" },
	{ kind: "link", detail: "acme.link/launch", meta: "from X" },
	{ kind: "uptime", detail: "api.acme.dev up", meta: "182 ms" },
	{ kind: "funnel", detail: "checkout step 3 of 4", meta: "62% through" },
	{ kind: "pageview", detail: "/docs/quickstart", meta: "Firefox · Canada" },
	{ kind: "event", detail: "invite_sent", meta: "team: 4 seats" },
];

const SCRIPT_LINES = [
	[{ text: "<script", tone: "muted" }],
	[
		{ text: "  src", tone: "attr" },
		{ text: "=", tone: "muted" },
		{ text: '"https://cdn.databuddy.cc/databuddy.js"', tone: "value" },
	],
	[
		{ text: "  data-client-id", tone: "attr" },
		{ text: "=", tone: "muted" },
		{ text: '"your-client-id"', tone: "value" },
	],
	[{ text: "  async", tone: "attr" }],
	[{ text: "></script>", tone: "muted" }],
] as const;

const TOKEN_TONES = {
	attr: "text-foreground/70",
	muted: "text-muted-foreground",
	value: "text-brand-amber",
} as const;

const benefits = [
	{
		title: "See the whole story in one place",
		description:
			"A new error, a slow page, and a drop in signups show up side by side, so you can see how they connect.",
		icon: StackIcon,
	},
	{
		title: "Respect your visitors' privacy",
		description:
			"No analytics cookies, and you decide whether events link to your own user profiles.",
		icon: ShieldCheckIcon,
	},
	{
		title: "Keep your pages fast",
		description:
			"The tracker is about 13 KB gzipped and loads asynchronously, so it stays out of your visitors' way.",
		icon: LightningIcon,
	},
	{
		title: "Never get locked in",
		description:
			"Databuddy is open source. Read the code, or run it on your own servers.",
		icon: CodeIcon,
	},
	{
		title: "Watch launches as they happen",
		description:
			"Follow visitors and events live while a launch or campaign goes out.",
		icon: WaveformIcon,
	},
	{
		title: "Get answers in plain words",
		description:
			"Ask Databunny about traffic, conversions, errors, or performance, and see the evidence behind each answer.",
		icon: RobotIcon,
	},
];

function clock(tick: number) {
	const total = FIRST_SECOND + tick * 2 + (tick % 2);
	return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
}

function ScriptPanel() {
	return (
		<div className={cn(FRAME, "flex flex-col overflow-hidden rounded")}>
			<div className="flex items-center gap-2 border-white/[0.06] border-b px-3 py-2">
				<span className="font-mono text-[10px] text-muted-foreground">
					index.html
				</span>
			</div>
			<pre className="flex-1 overflow-x-auto px-4 py-4 font-mono text-[11px] leading-6 sm:text-xs">
				{SCRIPT_LINES.map((line) => (
					<div key={line.map((token) => token.text).join("")}>
						{line.map((token) => (
							<span className={TOKEN_TONES[token.tone]} key={token.text}>
								{token.text}
							</span>
						))}
					</div>
				))}
			</pre>
			<div className="flex flex-wrap gap-x-4 gap-y-1 border-white/[0.06] border-t px-4 py-3 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
				<span>13 KB gzipped</span>
				<span>No cookies</span>
				<span>Loads async</span>
			</div>
		</div>
	);
}

function StreamPanel({ live, tick }: { live: boolean; tick: number }) {
	const rows = Array.from({ length: VISIBLE_ROWS + 1 }, (_, offset) => {
		const position = tick - offset;
		const entry =
			STREAM[((position % STREAM.length) + STREAM.length) % STREAM.length] ??
			STREAM[0];
		return { ...entry, position };
	});

	return (
		<div className={cn(FRAME, "overflow-hidden rounded")}>
			<div className="flex items-center justify-between gap-2 border-white/[0.06] border-b px-3 py-2">
				<span className="font-mono text-[10px] text-muted-foreground">
					One dashboard
				</span>
				<span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
					<span
						className={cn(
							"size-1.5 rounded-full bg-emerald-400",
							live && "animate-pulse motion-reduce:animate-none"
						)}
					/>
					Live
				</span>
			</div>
			<ul className="relative h-[calc(6*2.75rem)] overflow-hidden">
				<AnimatePresence initial={false} mode="popLayout">
					{rows.map((row) => (
						<motion.li
							animate={{ opacity: 1, y: 0 }}
							className="flex h-11 items-center gap-3 border-white/[0.04] border-b px-3 font-mono text-[11px] sm:px-4 sm:text-xs"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0, y: -12 }}
							key={row.position}
							layout
							transition={{ duration: 0.5, ease: IN_OUT }}
						>
							<span className="shrink-0 text-muted-foreground/60 tabular-nums">
								{clock(row.position)}
							</span>
							<span
								className={cn(
									"w-[4.75rem] shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] uppercase tracking-wide",
									KIND_STYLES[row.kind]
								)}
							>
								{row.kind}
							</span>
							<span className="min-w-0 flex-1 truncate text-foreground/85">
								{row.detail}
							</span>
							<span className="hidden shrink-0 text-muted-foreground sm:block">
								{row.meta}
							</span>
						</motion.li>
					))}
				</AnimatePresence>
			</ul>
		</div>
	);
}

function Connector({ live, tick }: { live: boolean; tick: number }) {
	return (
		<div aria-hidden className="relative hidden lg:block">
			<div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.08]" />
			{live ? (
				<motion.span
					animate={{ left: "100%", opacity: [0, 1, 1, 0] }}
					className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-amber shadow-[0_0_8px_2px_rgba(227,165,20,0.5)]"
					initial={{ left: "0%", opacity: 0 }}
					key={tick}
					transition={{ duration: TICK_SECONDS * 0.6, ease: IN_OUT }}
				/>
			) : null}
		</div>
	);
}

export const GridCards = () => {
	const ref = useRef<HTMLDivElement>(null);
	const visible = useInView(ref, { amount: 0.3 });
	const reduce = useReducedMotion();
	const live = visible && !reduce;
	const [tick, setTick] = useState(VISIBLE_ROWS - 1);

	useEffect(() => {
		if (!live) {
			return;
		}
		const id = window.setInterval(
			() => setTick((current) => current + 1),
			TICK_SECONDS * 1000
		);
		return () => window.clearInterval(id);
	}, [live]);

	return (
		<div className="w-full">
			<div className="mb-12 text-start lg:mb-16 lg:text-left">
				<h2 className="mx-auto flex max-w-4xl items-start gap-2 text-balance font-semibold text-2xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
					<span className="mt-1.5 hidden sm:block">
						<SectionBullet color="#B24A7E" />
					</span>
					<span className="text-foreground">
						Swap a stack of tools for one.
					</span>
				</h2>
				<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
					One tracker collects analytics, errors, and web vitals, and the same
					dashboard runs your funnels, flags, links, and uptime.
				</p>
			</div>

			<div
				aria-hidden
				className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_4rem_minmax(0,7fr)] lg:items-center lg:gap-0"
				ref={ref}
			>
				<ScriptPanel />
				<Connector live={live} tick={tick} />
				<StreamPanel live={live} tick={tick} />
			</div>

			<ul className="mt-12 grid gap-px border-white/[0.06] border-y bg-white/[0.06] sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
				{benefits.map((benefit) => (
					<li className="bg-background py-6 sm:p-6" key={benefit.title}>
						<benefit.icon className="size-4 text-muted-foreground" />
						<h3 className="mt-4 font-medium text-base text-foreground">
							{benefit.title}
						</h3>
						<p className="mt-1.5 max-w-sm text-pretty text-muted-foreground text-sm leading-relaxed">
							{benefit.description}
						</p>
					</li>
				))}
			</ul>
		</div>
	);
};
