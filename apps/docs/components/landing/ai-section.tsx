"use client";

import { ArrowRightIcon } from "@databuddy/ui/icons";
import { SiClaude } from "@icons-pack/react-simple-icons";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionBullet } from "../icons/section-bullet";
import { InvestigationStage } from "./databunny-demo-visuals";
import { useTimeline } from "./demo-primitives";
import { SciFiButton } from "./scifi-btn";
import { cn } from "@/lib/utils";

interface TerminalCall {
	args: string;
	more?: number;
	result: string;
	tool: string;
}

interface TerminalScenario {
	answer: string;
	calls: TerminalCall[];
	question: string;
	verb: string;
}

const TERMINAL_SCENARIOS: TerminalScenario[] = [
	{
		question:
			"How did the launch land? Set up tracking for the new pricing page.",
		verb: "Clauding",
		calls: [
			{
				tool: "get_data",
				args: 'websiteDomain: "databuddy.cc", preset: "last_7d", type: "summary_metrics"',
				result:
					'{"data":[{"pageviews":52910,"unique_visitors":18240,"sessions":24630,"bounce_rate":38.2}]}',
				more: 24,
			},
			{
				tool: "create_funnel",
				args: 'name: "Pricing to purchase", steps: [{"type":"PAGE_VIEW","target":"/pricing","name":"Pricing"},…], confirmed: true',
				result:
					'{"success":true,"message":"Funnel \\"Pricing to purchase\\" created successfully","funnel":{…}}',
			},
			{
				tool: "create_goal",
				args: 'name: "Plan upgraded", type: "EVENT", target: "plan_upgraded", confirmed: true',
				result:
					'{"success":true,"message":"Goal \\"Plan upgraded\\" created successfully","goal":{…}}',
			},
		],
		answer:
			"Launch week brought 18,240 visitors across 52,910 pageviews. I created a pricing funnel and a plan_upgraded goal, and both are live in your dashboard.",
	},
	{
		question: "Anything I should know before we ship today?",
		verb: "Pondering",
		calls: [
			{
				tool: "list_investigations",
				args: 'websiteDomain: "databuddy.cc"',
				result:
					'{"investigations":[{"id":"inv_7Qx2","title":"Checkout conversion down 22% vs the prior 7 days","status":"open"}],"hasMore":false}',
			},
			{
				tool: "get_data",
				args: 'websiteDomain: "databuddy.cc", preset: "last_7d", type: "error_segments"',
				result:
					'{"data":[{"dimension":"browser_name","value":"Safari","errors":412,"sessions":187},{"dimension":"browser_name","value":"Chrome","errors":96,"sessions":61}]}',
				more: 18,
			},
			{
				tool: "reply_to_investigation",
				args: 'investigationId: "inv_7Qx2", body: "Do the Safari checkout errors line up with the drop?", replyId: "safari-checkout-errors"',
				result: '{"reply":{"id":"rep_3kTm","kind":"reply","status":"queued"}}',
			},
		],
		answer:
			"Yes. This week's investigation found checkout conversion down 22% from the prior 7 days. Most checkout errors in that window come from Safari, so test checkout there before you ship. I asked Databunny whether the two line up.",
	},
];

const SPINNER_FRAMES = [
	"·",
	"✢",
	"✳",
	"✶",
	"✻",
	"✽",
	"✽",
	"✻",
	"✶",
	"✳",
	"✢",
	"·",
];
const SPINNER_TICK_MS = 120;
const TYPE_MS_PER_CHAR = 14;

const CC = {
	claude: "text-[#D77757]",
	dim: "text-[#999999]",
	success: "text-[#4EBA65]",
	userBg: "bg-[#373737]",
	rule: "border-[#888888]/60",
};

function scenarioTimeline(scenario: TerminalScenario) {
	const submit = (scenario.question.length * TYPE_MS_PER_CHAR) / 1000 + 0.6;
	const events = [submit];
	for (const [index] of scenario.calls.entries()) {
		const pending = submit + 0.9 + index * 1.3;
		events.push(pending, pending + 0.7);
	}
	const answer = (events.at(-1) ?? submit) + 0.5;
	events.push(answer, answer + 5.5);
	return { events, seconds: answer + 5.9 };
}

function useTyped(text: string, running: boolean) {
	const [count, setCount] = useState(0);
	useEffect(() => {
		setCount(0);
		if (!running) {
			return;
		}
		const id = window.setInterval(() => {
			setCount((current) => Math.min(current + 1, text.length));
		}, TYPE_MS_PER_CHAR);
		return () => window.clearInterval(id);
	}, [running, text]);
	return text.slice(0, count);
}

function useSpinnerFrame(running: boolean) {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		if (!running) {
			return;
		}
		const id = window.setInterval(() => {
			setFrame((current) => (current + 1) % SPINNER_FRAMES.length);
		}, SPINNER_TICK_MS);
		return () => window.clearInterval(id);
	}, [running]);
	return SPINNER_FRAMES[frame];
}

function Session({
	scenario,
	step,
	typed,
	spinner,
	ghost = false,
}: {
	scenario: TerminalScenario;
	step: number;
	typed: string;
	spinner: string;
	ghost?: boolean;
}) {
	const answerStep = 2 + scenario.calls.length * 2;
	const reached = (target: number) => ghost || step >= target;
	const working = ghost || (step >= 1 && step < answerStep);

	return (
		<div className={ghost ? "invisible" : undefined}>
			{reached(1) ? (
				<p className={cn("-mx-1 px-1 text-white", CC.userBg)}>
					<span className={CC.dim}>❯ </span>
					{scenario.question}
				</p>
			) : null}
			{scenario.calls.map((call, index) => {
				if (!reached(2 + index * 2)) {
					return null;
				}
				const done = reached(3 + index * 2);
				return (
					<div className="mt-3" key={call.tool}>
						<p className="flex gap-2">
							<span
								className={cn(
									"shrink-0",
									done ? CC.success : cn(CC.dim, "animate-pulse")
								)}
							>
								⏺
							</span>
							<span className="min-w-0 break-words text-white">
								<span className="font-bold">databuddy - {call.tool} (MCP)</span>
								({call.args})
							</span>
						</p>
						{done ? (
							<>
								<p className={cn("flex gap-2 pl-1", CC.dim)}>
									<span className="shrink-0">⎿</span>
									<span className="min-w-0 truncate">{call.result}</span>
								</p>
								{call.more ? (
									<p className={cn("pl-6", CC.dim)}>
										… +{call.more} lines (ctrl+o to expand)
									</p>
								) : null}
							</>
						) : null}
					</div>
				);
			})}
			{reached(answerStep) ? (
				<p className="mt-3 flex gap-2 text-white">
					<span className="shrink-0">⏺</span>
					<span className="min-w-0">{scenario.answer}</span>
				</p>
			) : null}
			{working ? (
				<p className="mt-3">
					<span className={CC.claude}>
						{spinner} {scenario.verb}…{" "}
					</span>
					<span className={CC.dim}>(esc to interrupt)</span>
				</p>
			) : null}
			<div className={cn("mt-3 border-y py-1 text-white", CC.rule)}>
				<p>
					<span className={CC.dim}>❯ </span>
					{ghost ? scenario.question : typed}
					<span className="ml-px inline-block h-[1.1em] w-[0.6em] translate-y-[0.2em] bg-white/80" />
				</p>
			</div>
			<p className={cn("mt-1 px-2", CC.dim)}>? for shortcuts</p>
		</div>
	);
}

export function McpTerminalDemo() {
	const reduce = useReducedMotion();
	const [scenarioIndex, setScenarioIndex] = useState(0);
	const scenario = TERMINAL_SCENARIOS[scenarioIndex];
	const { events, seconds } = useMemo(
		() => scenarioTimeline(scenario),
		[scenario]
	);
	const { ref, step, cycle } = useTimeline(events, seconds);
	const typing = step === 0 && !reduce;
	const typed = useTyped(scenario.question, typing);
	const answerStep = 2 + scenario.calls.length * 2;
	const spinner = useSpinnerFrame(step >= 1 && step < answerStep);
	const fading = !reduce && step > answerStep;

	useEffect(() => {
		setScenarioIndex(cycle % TERMINAL_SCENARIOS.length);
	}, [cycle]);

	return (
		<div aria-hidden className="relative w-full min-w-0" ref={ref}>
			<div className="overflow-hidden rounded-lg border border-white/10 bg-[#0f0f11] font-terminal text-[11px] leading-[1.6] shadow-[0_24px_64px_-24px_rgba(0,0,0,0.6)] sm:text-[12.5px]">
				<div className="relative flex h-8 items-center border-white/[0.06] border-b px-3">
					<div className="flex gap-1.5">
						<span className="size-2.5 rounded-full bg-[#ff5f57]" />
						<span className="size-2.5 rounded-full bg-[#febc2e]" />
						<span className="size-2.5 rounded-full bg-[#28c840]" />
					</div>
					<span className="absolute inset-x-0 text-center text-[11px] text-white/40">
						~/databuddy — claude
					</span>
				</div>

				<div className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
					<div className="flex items-center gap-3">
						<SiClaude className={cn("size-8 shrink-0", CC.claude)} />
						<div>
							<p className="font-bold text-white">Claude Code v2.1.280</p>
							<p className={CC.dim}>Opus 5.5 · Claude Max</p>
							<p className={CC.dim}>~/databuddy</p>
						</div>
					</div>

					<div className="mt-4 grid grid-cols-[minmax(0,1fr)] [&>*]:col-start-1 [&>*]:row-start-1">
						{TERMINAL_SCENARIOS.map((entry) => (
							<Session
								ghost
								key={entry.question}
								scenario={entry}
								spinner=""
								step={0}
								typed=""
							/>
						))}
						<div
							className={cn(
								"transition-opacity duration-300 ease-in-out",
								fading ? "opacity-0" : "opacity-100"
							)}
						>
							<Session
								scenario={scenario}
								spinner={spinner}
								step={step}
								typed={typing ? typed : ""}
							/>
						</div>
					</div>
				</div>
			</div>
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
					<span className="text-foreground">
						Know what changed without opening a dashboard.
					</span>
				</h2>
				<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
					Scheduled checks on Business and Scale: every day or week, Databunny
					compares the last 7 days of your metrics with the prior 7. When one
					really moves, you get what it found and the next step in Slack.
				</p>
			</div>

			<InvestigationStage />
			<div className="mt-4 flex justify-end">
				<Link
					className="inline-flex items-center gap-1 text-foreground text-sm transition-opacity hover:opacity-80"
					href="/databunny"
				>
					Meet Databunny
					<ArrowRightIcon className="size-3.5" />
				</Link>
			</div>

			<div className="mt-16 grid grid-cols-[minmax(0,1fr)] gap-10 border-border border-t pt-16 lg:mt-24 lg:grid-cols-12 lg:items-center lg:gap-12 lg:pt-24">
				<div className="min-w-0 lg:col-span-5">
					<h3 className="text-balance font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
						Check your numbers without leaving your editor
					</h3>
					<p className="mt-3 max-w-md text-pretty text-muted-foreground text-sm sm:text-base">
						Sign in from Claude or Claude Code, or connect Cursor and any other
						MCP client with a scoped key, and your agent can pull traffic, read
						investigations, and set up funnels, goals, and flags for you.
					</p>

					<div className="mt-6 flex flex-wrap items-center gap-4">
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
				<div className="min-w-0 lg:col-span-7">
					<McpTerminalDemo />
				</div>
			</div>
		</div>
	);
}
