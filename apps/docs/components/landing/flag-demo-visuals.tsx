"use client";

import { MotionConfig, motion } from "motion/react";
import {
	FRAME,
	IN_OUT,
	REWIND,
	pseudoRandom,
	useTimeline,
	Count,
} from "@/components/landing/demo-primitives";
import { cn } from "@/lib/utils";

const FLAG = "new-checkout";
const ON = "bg-emerald-500";
const OFF = "bg-white/[0.07]";

function FlagName({ children }: { children: string }) {
	return <span className="font-mono text-foreground text-sm">{children}</span>;
}

function Switch({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"relative inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors duration-300 ease-in-out",
				on ? "bg-emerald-500" : "bg-white/[0.12]"
			)}
		>
			<motion.span
				animate={{ x: on ? 16 : 0 }}
				className="size-4 rounded-full bg-background"
				initial={false}
				transition={{ duration: 0.3, ease: IN_OUT }}
			/>
		</span>
	);
}

const ROLLOUT_COLUMNS = 20;
const ROLLOUT_PEOPLE = Array.from(
	{ length: ROLLOUT_COLUMNS * 8 },
	(_, index) => pseudoRandom(`bucket-${index}`) * 100
);
const ROLLOUT_STEPS = [5, 25, 50, 100] as const;
const ROLLOUT_EVENTS = [1.4, 2.8, 4.2] as const;

export function RolloutGrid() {
	const { ref, step } = useTimeline(ROLLOUT_EVENTS, 6.6);
	const index = Math.min(step, ROLLOUT_STEPS.length - 1);
	const percent = ROLLOUT_STEPS[index] ?? ROLLOUT_STEPS[0];
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col gap-6" ref={ref}>
				<div className="flex items-center justify-between gap-4">
					<FlagName>{FLAG}</FlagName>
					<span className="text-foreground text-sm sm:text-base">
						On for <Count value={percent} />% of visitors
					</span>
				</div>
				<div
					className="grid justify-center gap-1.5"
					style={{
						gridTemplateColumns: `repeat(${ROLLOUT_COLUMNS}, 10px)`,
					}}
				>
					{ROLLOUT_PEOPLE.map((bucket, person) => (
						<span
							className={cn(
								"size-2.5 rounded-full transition-colors duration-500 ease-in-out",
								bucket < percent ? ON : OFF
							)}
							key={person}
							style={{ transitionDelay: `${(bucket % 25) * 12}ms` }}
						/>
					))}
				</div>
				<div className="flex flex-col gap-2">
					<div className="relative h-1.5 bg-white/[0.06]">
						<motion.span
							animate={{ width: `${percent}%` }}
							className="absolute inset-y-0 left-0 bg-emerald-500"
							initial={false}
							transition={{ duration: 0.8, ease: IN_OUT }}
						/>
						<motion.span
							animate={{ left: `${percent}%` }}
							className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 border-2 border-emerald-500 bg-background"
							initial={false}
							transition={{ duration: 0.8, ease: IN_OUT }}
						/>
					</div>
					<div className="relative h-4 font-mono text-[11px] text-muted-foreground">
						{ROLLOUT_STEPS.map((mark) => (
							<span
								className="absolute -translate-x-1/2"
								key={mark}
								style={{ left: `${mark}%` }}
							>
								{mark}%
							</span>
						))}
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}

const BROWSERS = Array.from({ length: 36 }, (_, index) => ({
	index,
	lag: pseudoRandom(`browser-${index}`) * 1.6,
}));
const KILL_EVENTS = [1.2] as const;

export function KillSwitch() {
	const { ref, step } = useTimeline(KILL_EVENTS, 6.2);
	const off = step >= 1;
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col items-center gap-6" ref={ref}>
				<div className="flex items-center gap-3">
					<FlagName>{FLAG}</FlagName>
					<Switch on={!off} />
				</div>
				<div
					className="grid justify-center gap-2"
					style={{ gridTemplateColumns: "repeat(12, 18px)" }}
				>
					{BROWSERS.map((browser) => (
						<span
							className={cn(
								"size-[18px] transition-colors duration-300 ease-in-out",
								off ? OFF : ON
							)}
							key={browser.index}
							style={{
								transitionDelay: off ? `${browser.lag * 1000}ms` : "0ms",
							}}
						/>
					))}
				</div>
			</div>
		</MotionConfig>
	);
}

const TEAMS = [0, 1, 2, 3, 4, 5] as const;
const TEAM_SIZE = 12;
const TEAMS_ON = [0, 3] as const;
const TEAM_EVENTS = [1, 2.4] as const;

function TeamBlocks({
	title,
	isOn,
}: {
	title: string;
	isOn: (team: number, person: number) => boolean;
}) {
	return (
		<div className="flex flex-col gap-4">
			<span className="text-muted-foreground text-sm">{title}</span>
			<div className="grid w-fit grid-cols-3 gap-4">
				{TEAMS.map((team) => (
					<div
						className="border border-white/[0.08] bg-background/40 p-2"
						key={team}
					>
						<div className="grid w-fit grid-cols-4 gap-1">
							{Array.from({ length: TEAM_SIZE }, (_, person) => (
								<span
									className={cn(
										"size-2.5 rounded-full transition-colors duration-500 ease-in-out",
										isOn(team, person) ? ON : OFF
									)}
									key={person}
									style={{ transitionDelay: `${person * 18}ms` }}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function TeamRollout() {
	const { ref, step } = useTimeline(TEAM_EVENTS, 6.4);
	const byPerson = step >= 1;
	const byTeam = step >= 2;
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="grid gap-8 px-5 py-6 sm:grid-cols-2 sm:px-6">
					<TeamBlocks
						isOn={(team, person) =>
							byPerson && pseudoRandom(`org-${team}-${person}`) < 0.33
						}
						title="By person"
					/>
					<TeamBlocks
						isOn={(team) =>
							byTeam && TEAMS_ON.some((teamOn) => teamOn === team)
						}
						title="By organization"
					/>
				</div>
			</div>
		</MotionConfig>
	);
}

const TEAM_DOMAIN = "@databuddy.cc";
const RULES = [
	{ field: "email", test: "ends with", value: TEAM_DOMAIN },
	{ field: "plan", test: "is", value: "pro" },
] as const;
const PEOPLE = [
	{ email: "i•••@databuddy.cc", plan: "free" },
	{ email: "m•••@gmail.com", plan: "pro" },
	{ email: "k•••@outlook.com", plan: "free" },
	{ email: "s•••@proton.me", plan: "pro" },
	{ email: "j•••@databuddy.cc", plan: "free" },
	{ email: "t•••@gmail.com", plan: "free" },
] as const;
const RULE_EVENTS = [1, 2.2] as const;

export function WhoSeesIt() {
	const { ref, step } = useTimeline(RULE_EVENTS, 6.4);
	const matches = (person: (typeof PEOPLE)[number]) =>
		(step >= 1 && person.email.endsWith(TEAM_DOMAIN)) ||
		(step >= 2 && person.plan === "pro");
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="flex flex-col gap-2 border-white/[0.06] border-b px-5 py-4 sm:px-6">
					{RULES.map((rule, index) => (
						<motion.div
							animate={{ opacity: step > index ? 1 : 0.25 }}
							className="flex items-center gap-2 font-mono text-xs"
							initial={false}
							key={rule.field}
							transition={
								step > index ? { duration: 0.4, ease: IN_OUT } : REWIND
							}
						>
							<span className="w-6 text-muted-foreground">
								{index === 0 ? "if" : "or"}
							</span>
							<span className="text-foreground">{rule.field}</span>
							<span className="text-muted-foreground">{rule.test}</span>
							<span className="text-emerald-500">{rule.value}</span>
						</motion.div>
					))}
				</div>
				<ul className="flex flex-col px-5 py-2 sm:px-6">
					{PEOPLE.map((person) => {
						const matched = matches(person);
						return (
							<li
								className="flex items-center justify-between gap-4 border-white/[0.04] border-b py-2.5 last:border-b-0"
								key={person.email}
							>
								<span
									className={cn(
										"font-mono text-xs transition-colors duration-300 ease-in-out sm:text-sm",
										matched ? "text-foreground" : "text-muted-foreground"
									)}
								>
									{person.email}
								</span>
								<span className="flex items-center gap-3">
									<span className="font-mono text-[11px] text-muted-foreground">
										{person.plan}
									</span>
									<span
										className={cn(
											"size-2.5 rounded-full transition-colors duration-300 ease-in-out",
											matched ? ON : OFF
										)}
									/>
								</span>
							</li>
						);
					})}
				</ul>
			</div>
		</MotionConfig>
	);
}

const CHILDREN = ["apple-pay", "saved-cards"] as const;
const DEPENDENCY_EVENTS = [1.2, 1.7, 3.6, 4.1] as const;

function FlagNode({ name, on }: { name: string; on: boolean }) {
	return (
		<div className="flex items-center justify-between gap-4 border border-white/[0.08] bg-background/40 px-4 py-3">
			<span
				className={cn(
					"font-mono text-sm transition-colors duration-300 ease-in-out",
					on ? "text-foreground" : "text-muted-foreground"
				)}
			>
				{name}
			</span>
			<Switch on={on} />
		</div>
	);
}

export function DependentFlags() {
	const { ref, step } = useTimeline(DEPENDENCY_EVENTS, 6.8);
	const parentOn = step < 1 || step >= 3;
	const childrenOn = step < 2 || step >= 4;
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<div className="flex flex-col items-center px-5 py-8 sm:px-10">
					<div className="w-full max-w-xs">
						<FlagNode name={FLAG} on={parentOn} />
					</div>
					<div className="relative h-10 w-full max-w-md">
						<span
							className={cn(
								"absolute top-0 left-1/2 h-5 w-px transition-colors duration-300 ease-in-out",
								parentOn ? "bg-emerald-500/60" : "bg-white/10"
							)}
						/>
						<span
							className={cn(
								"absolute top-5 right-1/4 left-1/4 h-px transition-colors duration-300 ease-in-out",
								childrenOn ? "bg-emerald-500/60" : "bg-white/10"
							)}
						/>
						{[25, 75].map((x) => (
							<span
								className={cn(
									"absolute top-5 h-5 w-px transition-colors duration-300 ease-in-out",
									childrenOn ? "bg-emerald-500/60" : "bg-white/10"
								)}
								key={x}
								style={{ left: `${x}%` }}
							/>
						))}
					</div>
					<div className="grid w-full max-w-md grid-cols-2 gap-4">
						{CHILDREN.map((child) => (
							<FlagNode key={child} name={child} on={childrenOn} />
						))}
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}
