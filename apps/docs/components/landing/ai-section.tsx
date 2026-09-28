"use client";

import {
	ArrowRightIcon,
	CheckIcon,
	PlugIcon,
	RobotIcon,
} from "@databuddy/ui/icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionBullet } from "../icons/section-bullet";
import { InvestigationStage } from "./databunny-demo-visuals";
import { EASE } from "./demo-constants";
import { CardChrome, useRevealOnScroll } from "./demo-primitives";
import { SciFiButton } from "./scifi-btn";
import { cn } from "@/lib/utils";

const MCP_CLIENTS = [
	"Claude Code",
	"Claude Desktop",
	"Cursor",
	"Windsurf",
	"VS Code",
	"Zed",
] as const;

function revealStyle(visible: boolean, delayMs: number) {
	return {
		transitionDelay: visible ? `${delayMs}ms` : "0ms",
		transitionTimingFunction: EASE,
	};
}

const TERMINAL_SCENARIOS = [
	{
		question:
			"How did the launch land? Set up tracking for the new pricing page.",
		calls: [
			{ tool: "get_data", detail: "traffic and conversions · launch week" },
			{
				tool: "create_funnel",
				detail: "/pricing → /checkout/payment → purchase",
			},
			{ tool: "create_goal", detail: "plan_upgraded" },
		],
		answer:
			"Launch week traffic is up 64%. I created a pricing funnel and a plan_upgraded goal; both are live in your dashboard.",
	},
	{
		question: "Anything I should know before we ship today?",
		calls: [
			{
				tool: "get_investigation",
				detail: "checkout errors +180% · opened this morning",
			},
			{ tool: "get_data", detail: "errors by device · past 24h" },
			{ tool: "reply_to_investigation", detail: "rolled back in v2.14.1" },
		],
		answer:
			"Yes. Databunny opened an investigation this morning: checkout exceptions are up 2.8x since yesterday's deploy, concentrated on iOS Safari. I rolled back address autocomplete and replied to the investigation.",
	},
] as const;

const TYPE_CHARS_PER_TICK = 2;
const TYPE_TICK_MS = 24;
const HOLD_MS = 5200;
const FADE_MS = 350;

function useTypewriter(text: string, active: boolean) {
	const [typed, setTyped] = useState(0);

	useEffect(() => {
		setTyped(0);
	}, [text]);

	useEffect(() => {
		if (!active) {
			return;
		}
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setTyped(text.length);
			return;
		}
		const id = window.setInterval(() => {
			setTyped((count) => {
				if (count >= text.length) {
					window.clearInterval(id);
					return count;
				}
				return count + TYPE_CHARS_PER_TICK;
			});
		}, TYPE_TICK_MS);
		return () => window.clearInterval(id);
	}, [active, text.length]);

	return { text: text.slice(0, typed), done: typed >= text.length };
}

function useOnScreen(ref: React.RefObject<HTMLDivElement | null>) {
	const [onScreen, setOnScreen] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => setOnScreen(entries[0]?.isIntersecting ?? false),
			{ threshold: 0.2 }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);

	return onScreen;
}

export function McpTerminalDemo() {
	const { ref, visible } = useRevealOnScroll();
	const onScreen = useOnScreen(ref);
	const [scenarioIndex, setScenarioIndex] = useState(0);
	const [fading, setFading] = useState(false);
	const scenario = TERMINAL_SCENARIOS[scenarioIndex];
	const question = useTypewriter(scenario.question, visible && onScreen);
	const showing = visible && question.done && !fading;

	useEffect(() => {
		if (!(question.done && onScreen) || fading) {
			return;
		}
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			return;
		}
		const id = window.setTimeout(() => setFading(true), HOLD_MS);
		return () => window.clearTimeout(id);
	}, [question.done, onScreen, fading]);

	useEffect(() => {
		if (!fading) {
			return;
		}
		const id = window.setTimeout(() => {
			setScenarioIndex((index) => (index + 1) % TERMINAL_SCENARIOS.length);
			setFading(false);
		}, FADE_MS);
		return () => window.clearTimeout(id);
	}, [fading]);

	return (
		<div aria-hidden className="relative mt-3 w-full" ref={ref}>
			<CardChrome className="overflow-hidden">
				<div className="flex items-center gap-2 border-white/[0.06] border-b px-3 py-2">
					<span className="flex gap-1.5">
						<span className="size-2 rounded-full bg-red-500/60" />
						<span className="size-2 rounded-full bg-amber-500/60" />
						<span className="size-2 rounded-full bg-emerald-500/60" />
					</span>
					<span className="font-mono text-[10px] text-muted-foreground">
						your agent
					</span>
					<span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
						<span
							className={cn(
								"size-1.5 rounded-full bg-emerald-400",
								visible && "animate-pulse motion-reduce:animate-none"
							)}
						/>
						databuddy · scoped key
					</span>
				</div>
				<div
					className={cn(
						"min-h-[190px] space-y-2.5 px-3 py-3 transition-opacity duration-300 sm:px-4",
						fading ? "opacity-0" : "opacity-100"
					)}
				>
					<p
						className={cn(
							"font-medium font-mono text-foreground text-xs transition-opacity duration-300 sm:text-sm",
							visible ? "opacity-100" : "opacity-0"
						)}
					>
						<span className="mr-1.5 text-muted-foreground">›</span>
						{question.text}
						<span
							className={cn(
								"ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-muted-foreground/70",
								question.done
									? "opacity-0"
									: "animate-pulse motion-reduce:animate-none"
							)}
						/>
					</p>
					{scenario.calls.map((call, i) => (
						<div
							className={cn(
								"flex flex-wrap items-center gap-x-2 gap-y-0.5 transition-all duration-500",
								showing
									? "translate-y-0 opacity-100"
									: "translate-y-3 opacity-0"
							)}
							key={call.tool}
							style={revealStyle(showing, 150 + i * 180)}
						>
							<span className="inline-flex items-center gap-1.5 rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[11px] text-violet-400">
								<PlugIcon className="size-3" />
								{call.tool}
							</span>
							<span className="font-mono text-[11px] text-muted-foreground">
								{call.detail}
							</span>
							<CheckIcon
								className={cn(
									"size-3 text-emerald-400 transition-all duration-200 ease-out",
									showing ? "scale-100 opacity-100" : "scale-50 opacity-0"
								)}
								style={{
									transitionDelay: showing ? `${450 + i * 180}ms` : "0ms",
								}}
							/>
						</div>
					))}
					<p
						className={cn(
							"font-mono text-[11px] text-muted-foreground leading-relaxed transition-all duration-500 sm:text-xs",
							showing ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
						)}
						style={revealStyle(showing, 850)}
					>
						{scenario.answer}
					</p>
				</div>
			</CardChrome>
		</div>
	);
}

export function AiSection() {
	return (
		<div className="w-full">
			<div className="mb-10 lg:mb-12">
				<h2 className="mx-auto flex max-w-4xl items-start gap-2 text-balance font-semibold text-2xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
					<span className="mt-1.5 hidden sm:block">
						<SectionBullet color="#6E56CF" />
					</span>
					<span className="text-foreground">A morning read, not a pager.</span>
				</h2>
				<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
					Every morning, Databunny compares your metrics with recent history.
					When something really moves, it investigates across your data, code,
					and revenue and tells you what to do. Actions and questions land in
					Slack with the evidence behind them.
				</p>
			</div>

			<InvestigationStage />
			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
					<RobotIcon className="size-3.5 text-violet-400" />
					Proactive · Business and Scale
				</span>
				<Link
					className="inline-flex items-center gap-1 text-foreground text-sm transition-opacity hover:opacity-80"
					href="/databunny"
				>
					Meet Databunny
					<ArrowRightIcon className="size-3.5" />
				</Link>
			</div>

			<div className="mt-16 grid grid-cols-1 items-center gap-8 lg:mt-24 lg:grid-cols-[2fr_3fr] lg:gap-12">
				<div className="flex flex-col">
					<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
						<PlugIcon className="size-3.5 text-violet-400" />
						MCP
					</span>
					<h3 className="mt-2 font-semibold text-foreground text-lg sm:text-xl">
						Analytics run by your agent
					</h3>
					<p className="mt-1.5 max-w-xl text-muted-foreground text-sm">
						Connect Claude Code, Cursor, or any MCP client with a scoped key.
						Your agent can query live traffic, triage errors, create goals,
						funnels, and flags, and pick up any investigation Databunny opened.
						It gets exactly the permissions you grant.
					</p>
					<div className="mt-4 flex flex-wrap gap-1.5">
						{MCP_CLIENTS.map((client) => (
							<span
								className="rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-muted-foreground text-xs"
								key={client}
							>
								{client}
							</span>
						))}
					</div>
					<div className="mt-5 flex flex-wrap items-center gap-4">
						<SciFiButton asChild>
							<Link href="/docs/api/mcp">Set up MCP</Link>
						</SciFiButton>
						<Link
							className="inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
							href="/docs/api"
						>
							API reference
							<ArrowRightIcon className="size-3.5" />
						</Link>
					</div>
				</div>
				<McpTerminalDemo />
			</div>
		</div>
	);
}
