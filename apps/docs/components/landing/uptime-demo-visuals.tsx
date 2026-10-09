"use client";

import {
	BellIcon,
	CodeIcon,
	EnvelopeIcon,
	LockIcon,
} from "@databuddy/ui/icons";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Image from "next/image";
import {
	FRAME,
	IN_OUT,
	REWIND,
	Reveal,
	SlackLogo,
	pseudoRandom,
	rounded,
	useTimeline,
	Count,
} from "@/components/landing/demo-primitives";
import { cn } from "@/lib/utils";

const SITE = "Website";
const UP_BAR = "bg-foreground/30";
const DOWN_BAR = "bg-red-500";
const EMPTY_BAR = "bg-white/[0.06]";

function Swap({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<AnimatePresence initial={false} mode="wait">
			<motion.span
				animate={{ opacity: 1, y: 0 }}
				className={cn("inline-block", className)}
				exit={{ opacity: 0, y: -4 }}
				initial={{ opacity: 0, y: 4 }}
				key={children}
				transition={{ duration: 0.25, ease: IN_OUT }}
			>
				{children}
			</motion.span>
		</AnimatePresence>
	);
}

const MINUTES = 60;
const HISTORY = 24;
const OUTAGE_START = 34;
const OUTAGE_END = 46;
const isOutage = (minute: number) =>
	minute >= OUTAGE_START && minute < OUTAGE_END;
const RESPONSE_HEIGHTS = Array.from({ length: MINUTES }, (_, minute) =>
	isOutage(minute) ? 100 : rounded(28 + pseudoRandom(`ttfb-${minute}`) * 30)
);
const STRIP_EVENTS = Array.from(
	{ length: MINUTES - HISTORY },
	(_, tick) => 0.4 + tick * 0.11
);

export function CheckStrip() {
	const { ref, step } = useTimeline(STRIP_EVENTS, 7.8);
	const checked = HISTORY + step;
	const down = isOutage(checked - 1);
	const recovered = checked > OUTAGE_END;
	let alertText = "No alerts in the last hour";
	let alertTone = "text-muted-foreground";
	if (recovered) {
		alertText = `Health check passed: ${SITE}`;
		alertTone = "text-foreground";
	} else if (checked > OUTAGE_START) {
		alertText = `Health check failed: ${SITE}`;
		alertTone = "text-red-500";
	}
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col gap-4" ref={ref}>
				<div className="flex items-center justify-between gap-4">
					<span className="font-mono text-foreground text-sm">{SITE}</span>
					<span
						className={cn(
							"flex items-center gap-2 text-sm transition-colors duration-300 ease-in-out sm:text-base",
							down ? "text-red-500" : "text-foreground"
						)}
					>
						<span
							className={cn(
								"size-2 rounded-full transition-colors duration-300 ease-in-out",
								down ? "bg-red-500" : "bg-emerald-500"
							)}
						/>
						<Swap>{down ? "Down" : "Up"}</Swap>
					</span>
				</div>
				<div className="relative">
					<div
						className="grid h-20 items-end gap-[3px]"
						style={{
							gridTemplateColumns: `repeat(${MINUTES}, minmax(0, 1fr))`,
						}}
					>
						{RESPONSE_HEIGHTS.map((height, minute) => {
							const isChecked = checked > minute;
							let tone = EMPTY_BAR;
							if (isChecked) {
								tone = isOutage(minute) ? DOWN_BAR : UP_BAR;
							}
							return (
								<span
									className={cn(
										"rounded-[1px] transition-[height,background-color] duration-300 ease-in-out",
										tone
									)}
									key={minute}
									style={{ height: isChecked ? `${height}%` : "14%" }}
								/>
							);
						})}
					</div>
				</div>
				<div className="flex justify-between text-muted-foreground text-xs">
					<span>1 hour ago</span>
					<span>Now</span>
				</div>
				<div className="flex h-12 items-center gap-3 border border-white/[0.08] bg-white/[0.02] px-4">
					<SlackLogo className="size-4 shrink-0 text-foreground" />
					<span className="min-w-0 truncate text-sm">
						<Swap
							className={cn(
								"transition-colors duration-300 ease-in-out",
								alertTone
							)}
						>
							{alertText}
						</Swap>
					</span>
				</div>
			</div>
		</MotionConfig>
	);
}

const RETRY_CASES = [
	{ id: "blip", codes: ["502", "200"], result: "Up", down: false },
	{ id: "outage", codes: ["502", "502", "502"], result: "Down", down: true },
] as const;
const RETRY_COLUMNS = ["Check", "Retry", "Retry"] as const;
const RETRY_EVENTS = [0.7, 1.3, 1.9, 2.8, 3.4, 4, 4.6] as const;
const RETRY_STEPS = [
	[1, 2, 3],
	[4, 5, 6, 7],
] as const;

function Attempt({ code, shown }: { code?: string; shown: boolean }) {
	const failed = code !== undefined && code !== "200";
	return (
		<span className="flex items-center gap-2">
			<span
				className={cn(
					"size-3 rounded-full border transition-colors duration-300 ease-in-out",
					shown && code
						? cn("border-transparent", failed ? "bg-red-500" : "bg-emerald-500")
						: "border-white/15 bg-transparent"
				)}
			/>
			{code && (
				<motion.span
					animate={{ opacity: shown ? 1 : 0 }}
					className={cn(
						"font-mono text-xs sm:text-sm",
						failed ? "text-red-500" : "text-foreground"
					)}
					initial={false}
					transition={shown ? { duration: 0.3, ease: IN_OUT } : REWIND}
				>
					{code}
				</motion.span>
			)}
		</span>
	);
}

export function RetryCheck() {
	const { ref, step } = useTimeline(RETRY_EVENTS, 7.6);
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col" ref={ref}>
				<div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)] gap-3 border-white/[0.06] border-b pb-3 text-muted-foreground text-xs sm:text-sm">
					{RETRY_COLUMNS.map((column, index) => (
						<span key={`${column}-${index}`}>{column}</span>
					))}
					<span className="text-right">Status</span>
				</div>
				{RETRY_CASES.map((retryCase, caseIndex) => {
					const steps = RETRY_STEPS[caseIndex] ?? [];
					const resultStep = steps.at(-1) ?? 0;
					const decided = step >= resultStep;
					return (
						<div
							className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)] items-center gap-3 border-white/[0.06] border-b py-5 last:border-b-0"
							key={retryCase.id}
						>
							{RETRY_COLUMNS.map((column, index) => (
								<Attempt
									code={retryCase.codes[index]}
									key={`${column}-${index}`}
									shown={step >= (steps[index] ?? resultStep)}
								/>
							))}
							<motion.span
								animate={{ opacity: decided ? 1 : 0, x: decided ? 0 : -6 }}
								className={cn(
									"flex items-center justify-end gap-2 text-sm sm:text-base",
									retryCase.down ? "text-red-500" : "text-emerald-500"
								)}
								initial={false}
								transition={decided ? { duration: 0.4, ease: IN_OUT } : REWIND}
							>
								{retryCase.down && <BellIcon className="size-4" />}
								{retryCase.result}
							</motion.span>
						</div>
					);
				})}
			</div>
		</MotionConfig>
	);
}

const ALERT_TICKS = 16;
const ALERT_DOWN_AT = 2;
const ALERT_UP_AT = 14;
const ALERT_EVENTS = Array.from(
	{ length: ALERT_TICKS },
	(_, tick) => 0.5 + tick * 0.26
);
const tickTime = (tick: number) => `14:${String(tick).padStart(2, "0")}`;
const ALERTS = [
	{
		at: ALERT_DOWN_AT,
		title: `Health check failed: ${SITE}`,
		detail: "HTTP 502: Bad Gateway",
		down: true,
	},
	{
		at: ALERT_UP_AT,
		title: `Health check passed: ${SITE}`,
		detail: "Response time 212 ms",
		down: false,
	},
] as const;
const CHANNELS = [
	{ name: "Slack", icon: SlackLogo },
	{ name: "Email", icon: EnvelopeIcon },
	{ name: "Webhook", icon: CodeIcon },
] as const;

export function StatusAlerts() {
	const { ref, step } = useTimeline(ALERT_EVENTS, 7.8);
	return (
		<MotionConfig reducedMotion="user">
			<div className={FRAME} ref={ref}>
				<ul className="flex flex-col">
					{ALERTS.map((alert) => (
						<li
							className="border-white/[0.06] border-b px-5 py-4 sm:px-6"
							key={alert.title}
						>
							<motion.div
								animate={{ opacity: step > alert.at ? 1 : 0.15 }}
								className="grid grid-cols-[10px_1fr_auto] items-baseline gap-3"
								initial={false}
								transition={
									step > alert.at ? { duration: 0.45, ease: IN_OUT } : REWIND
								}
							>
								<span
									className={cn(
										"size-2 translate-y-[-1px] rounded-full",
										alert.down ? "bg-red-500" : "bg-emerald-500"
									)}
								/>
								<span className="flex min-w-0 flex-col gap-1">
									<span className="truncate font-medium text-foreground text-sm">
										{alert.title}
									</span>
									<span className="text-muted-foreground text-xs sm:text-sm">
										{alert.detail}
									</span>
								</span>
								<span className="flex items-center gap-2.5 self-center text-foreground">
									{CHANNELS.map((channel, order) => (
										<motion.span
											animate={{ opacity: step > alert.at ? 1 : 0.2 }}
											initial={false}
											key={channel.name}
											transition={
												step > alert.at
													? {
															duration: 0.3,
															ease: IN_OUT,
															delay: 0.15 + order * 0.12,
														}
													: REWIND
											}
										>
											<channel.icon aria-hidden className="size-4" />
										</motion.span>
									))}
								</span>
							</motion.div>
						</li>
					))}
				</ul>
				<div className="px-5 pt-5 pb-3 sm:px-6">
					<div
						className="grid h-10 gap-1"
						style={{
							gridTemplateColumns: `repeat(${ALERT_TICKS}, minmax(0, 1fr))`,
						}}
					>
						{Array.from({ length: ALERT_TICKS }, (_, tick) => {
							const failing = tick >= ALERT_DOWN_AT && tick < ALERT_UP_AT;
							let tone = EMPTY_BAR;
							if (step > tick) {
								tone = failing ? DOWN_BAR : UP_BAR;
							}
							return (
								<span
									className={cn(
										"rounded-[1px] transition-colors duration-300 ease-in-out",
										tone
									)}
									key={tick}
								/>
							);
						})}
					</div>
					<div className="relative h-6 font-mono text-muted-foreground text-xs">
						{ALERTS.map((alert) => (
							<div
								className="absolute top-2 -translate-x-1/2"
								key={alert.title}
								style={{
									left: `${rounded(((alert.at + 0.5) / ALERT_TICKS) * 100)}%`,
								}}
							>
								<Reveal distance={4} shown={step > alert.at}>
									{tickTime(alert.at)}
								</Reveal>
							</div>
						))}
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}

const STATUS_DAYS = 90;
const TODAY = STATUS_DAYS - 1;
const SERVICES = [
	{ name: "Website", uptime: "99.99%", pastIssue: null },
	{ name: "API", uptime: "100%", pastIssue: null },
	{ name: "Dashboard", uptime: "99.98%", pastIssue: 57 },
] as const;
const INCIDENT_UPDATES = [
	{
		status: "Investigating",
		message: "We're seeing errors on the website.",
		time: "14:03",
	},
	{
		status: "Identified",
		message: "A bad deploy caused this, and we're rolling it back.",
		time: "14:08",
	},
	{
		status: "Resolved",
		message: "The rollback is out and the site is back.",
		time: "14:15",
	},
] as const;
const STATUS_EVENTS = [1, 2, 3.2, 4.4] as const;

export function StatusPagePreview() {
	const { ref, step } = useTimeline(STATUS_EVENTS, 8.4);
	const websiteDown = step >= 1 && step < 4;
	const posted = step >= 2;
	const resolved = step >= 4;
	const updates = Math.max(0, step - 1);
	return (
		<MotionConfig reducedMotion="user">
			<div
				className={cn(
					FRAME,
					"grid gap-10 p-5 sm:p-8 lg:grid-cols-[3fr_2fr] lg:gap-14"
				)}
				ref={ref}
			>
				<div className="flex min-w-0 flex-col gap-8">
					<div className="flex items-center gap-2.5">
						<Image
							alt=""
							className="size-6"
							height={24}
							src="/brand/logomark/white.svg"
							unoptimized
							width={24}
						/>
						<span className="font-medium text-foreground text-sm">
							Databuddy
						</span>
					</div>
					<div className="flex items-center gap-3">
						<span
							className={cn(
								"size-2.5 rounded-full transition-colors duration-300 ease-in-out",
								websiteDown ? "bg-brand-amber" : "bg-emerald-500"
							)}
						/>
						<Swap className="font-semibold text-foreground text-xl tracking-tight sm:text-2xl">
							{websiteDown
								? "Some systems degraded"
								: "We're fully operational"}
						</Swap>
					</div>
					<ul className="flex flex-col gap-6">
						{SERVICES.map((service) => {
							const isWebsite = service.name === "Website";
							const down = isWebsite && websiteDown;
							return (
								<li className="flex flex-col gap-2.5" key={service.name}>
									<div className="flex items-baseline justify-between gap-4 text-sm">
										<span className="text-foreground">{service.name}</span>
										<span
											className={cn(
												"transition-colors duration-300 ease-in-out",
												down ? "text-red-500" : "text-muted-foreground"
											)}
										>
											<Swap>{down ? "Down" : `${service.uptime} uptime`}</Swap>
										</span>
									</div>
									<div
										className="grid h-7 gap-px"
										style={{
											gridTemplateColumns: `repeat(${STATUS_DAYS}, minmax(0, 1fr))`,
										}}
									>
										{Array.from({ length: STATUS_DAYS }, (_, day) => {
											let tone = UP_BAR;
											if (day === service.pastIssue) {
												tone = "bg-brand-amber";
											} else if (isWebsite && day === TODAY && step >= 1) {
												tone = resolved ? "bg-brand-amber" : DOWN_BAR;
											}
											return (
												<span
													className={cn(
														"rounded-[1px] transition-colors duration-300 ease-in-out",
														tone
													)}
													key={day}
												/>
											);
										})}
									</div>
								</li>
							);
						})}
					</ul>
				</div>
				<div className="flex min-w-0 flex-col gap-4 lg:border-white/[0.06] lg:border-l lg:pl-14">
					<Swap className="text-muted-foreground text-sm">
						{posted && !resolved ? "Active incidents" : "Past incidents"}
					</Swap>
					<div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
						<Reveal shown={!posted}>
							<p className="text-muted-foreground text-sm">
								No incidents reported in the last 90 days.
							</p>
						</Reveal>
						<Reveal className="flex flex-col gap-5" shown={posted}>
							<span className="flex items-center gap-2">
								<span
									className={cn(
										"size-2 rounded-full transition-colors duration-300 ease-in-out",
										resolved ? "bg-emerald-500" : "bg-brand-amber"
									)}
								/>
								<span className="font-medium text-base text-foreground">
									Website returning errors
								</span>
							</span>
							<ol className="ml-[3px] flex flex-col gap-4 border-white/10 border-l pl-4">
								{INCIDENT_UPDATES.map((update, index) => (
									<li key={update.status}>
										<Reveal shown={updates > index}>
											<p className="text-sm">
												<span className="font-medium text-foreground">
													{update.status}
												</span>{" "}
												<span className="text-muted-foreground">
													{update.message}
												</span>
											</p>
											<span className="font-mono text-muted-foreground text-xs">
												{update.time}
											</span>
										</Reveal>
									</li>
								))}
							</ol>
						</Reveal>
					</div>
				</div>
			</div>
		</MotionConfig>
	);
}

const CERT_FROM = 30;
const CERT_WINDOW = 14;
const CERT_TICKS = CERT_FROM - CERT_WINDOW;
const CERT_EVENTS = [
	...Array.from({ length: CERT_TICKS }, (_, tick) => 0.6 + tick * 0.16),
	0.6 + CERT_TICKS * 0.16 + 0.4,
];

export function CertCountdown() {
	const { ref, step } = useTimeline(CERT_EVENTS, 7.6);
	const daysLeft = CERT_FROM - Math.min(step, CERT_TICKS);
	const inWindow = daysLeft <= CERT_WINDOW;
	const alerted = step > CERT_TICKS;
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col gap-6" ref={ref}>
				<div className="flex flex-col gap-1">
					<span className="flex items-center gap-2 text-muted-foreground text-sm">
						<LockIcon className="size-4" />
						SSL certificate
					</span>
					<span
						className={cn(
							"font-semibold text-5xl tracking-tight transition-colors duration-500 ease-in-out sm:text-6xl",
							inWindow ? "text-brand-amber" : "text-foreground"
						)}
					>
						<Count value={daysLeft} />{" "}
						<span className="font-normal text-lg text-muted-foreground sm:text-xl">
							days left
						</span>
					</span>
				</div>
				<div
					className="grid h-8 gap-1"
					style={{
						gridTemplateColumns: `repeat(${CERT_FROM}, minmax(0, 1fr))`,
					}}
				>
					{Array.from({ length: CERT_FROM }, (_, day) => {
						let tone = EMPTY_BAR;
						if (day < daysLeft) {
							tone = inWindow ? "bg-brand-amber/70" : UP_BAR;
						}
						return (
							<span
								className={cn(
									"rounded-[1px] transition-colors duration-300 ease-in-out",
									tone
								)}
								key={day}
							/>
						);
					})}
				</div>
				<Reveal
					className="flex items-start gap-3 border-white/[0.06] border-t pt-5"
					shown={alerted}
				>
					<SlackLogo className="mt-0.5 size-4 shrink-0 text-foreground" />
					<span className="flex flex-col gap-1">
						<span className="font-medium text-foreground text-sm">
							SSL certificate expires in {CERT_WINDOW} days: {SITE}
						</span>
						<span className="text-muted-foreground text-xs sm:text-sm">
							Renew it before then to avoid browser security warnings.
						</span>
					</span>
				</Reveal>
			</div>
		</MotionConfig>
	);
}
