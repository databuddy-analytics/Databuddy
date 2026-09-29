"use client";

import { CursorClickIcon, DesktopIcon } from "@databuddy/ui/icons";
import {
	SiAndroid,
	SiApple,
	SiAppstore,
	SiDiscord,
	SiFirefox,
	SiGmail,
	SiGoogle,
	SiGooglechrome,
	SiGoogleplay,
	SiSafari,
	SiX,
} from "@icons-pack/react-simple-icons";
import { MotionConfig, motion } from "motion/react";
import Image from "next/image";
import type { ComponentType, ReactNode } from "react";
import {
	FRAME,
	IN_OUT,
	REWIND,
	SlackLogo,
	pseudoRandom,
	useTimeline,
	Count,
} from "@/components/landing/demo-primitives";
import { cn } from "@/lib/utils";

type Logo = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const LINK = "dby.sh/launch";
const DESTINATION = "databuddy.cc";

function LinkedinLogo({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="currentColor"
			viewBox="0 0 24 24"
		>
			<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
		</svg>
	);
}

const SOURCES: { name: string; clicks: number; y: number; logo: Logo }[] = [
	{ name: "X", clicks: 121, y: 20, logo: SiX },
	{ name: "LinkedIn", clicks: 43, y: 40, logo: LinkedinLogo },
	{ name: "Gmail", clicks: 184, y: 60, logo: SiGmail },
	{ name: "Direct", clicks: 96, y: 80, logo: CursorClickIcon },
];
const SOURCE_ORDER = [0, 1, 3, 0, 2, 1, 0, 3, 1, 0, 2, 3] as const;
const LANE_START = 38;
const NODE_X = 66;
const LANE_END = 95;
const CLICK_EVENTS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5] as const;
const CLICKS_PER_CYCLE = CLICK_EVENTS.length + 1;
const IN_FLIGHT = 4;

const sourceOf = (click: number) =>
	SOURCE_ORDER[click % SOURCE_ORDER.length] ?? 0;

const arrivedFrom = (source: number, arrived: number) => {
	const perRound = SOURCE_ORDER.filter((order) => order === source).length;
	const partial = SOURCE_ORDER.slice(0, arrived % SOURCE_ORDER.length).filter(
		(order) => order === source
	).length;
	return Math.floor(arrived / SOURCE_ORDER.length) * perRound + partial;
};

export function ClickSources() {
	const { ref, step, cycle } = useTimeline(CLICK_EVENTS, 4);
	const sent = cycle * CLICKS_PER_CYCLE + step;
	const arrived = Math.max(0, sent - 1);
	const inFlight = Array.from(
		{ length: IN_FLIGHT },
		(_, offset) => sent - offset
	).filter((click) => click >= 0);
	return (
		<MotionConfig reducedMotion="user">
			<div className={cn(FRAME, "relative h-60 sm:h-72")} ref={ref}>
				<svg
					aria-hidden="true"
					className="absolute inset-0 size-full"
					preserveAspectRatio="none"
					viewBox="0 0 100 100"
				>
					{SOURCES.map((source) => (
						<path
							className="stroke-white/10"
							d={`M ${LANE_START} ${source.y} L ${NODE_X} 50`}
							fill="none"
							key={source.name}
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					))}
					<path
						className="stroke-white/10"
						d={`M ${NODE_X} 50 L ${LANE_END} 50`}
						fill="none"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				{SOURCES.map((source, index) => (
					<div
						className="absolute flex -translate-y-1/2 items-baseline justify-between gap-2 pr-3 pl-4 sm:pl-6"
						key={source.name}
						style={{ top: `${source.y}%`, left: 0, width: `${LANE_START}%` }}
					>
						<span className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs sm:text-sm">
							<source.logo
								aria-hidden
								className="size-3.5 shrink-0 sm:size-4"
							/>
							<span className="truncate">{source.name}</span>
						</span>
						<span className="font-medium text-foreground text-xs sm:text-sm">
							<Count value={source.clicks + arrivedFrom(index, arrived)} />
						</span>
					</div>
				))}
				{inFlight.map((click) => {
					const source = SOURCES[sourceOf(click)] ?? SOURCES[0];
					if (!source) {
						return null;
					}
					return (
						<motion.span
							animate={{
								left: [`${LANE_START}%`, `${NODE_X}%`, `${LANE_END}%`],
								top: [`${source.y}%`, "50%", "50%"],
								opacity: [0, 1, 1, 0],
							}}
							className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/85 motion-reduce:hidden"
							initial={{
								left: `${LANE_START}%`,
								top: `${source.y}%`,
								opacity: 0,
							}}
							key={click}
							transition={{ duration: 1.8, ease: IN_OUT }}
						/>
					);
				})}
				<span
					className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap border border-white/15 bg-background px-3 py-1.5 font-mono text-foreground text-xs sm:text-sm"
					style={{ left: `${NODE_X}%` }}
				>
					{LINK}
				</span>
				<span
					className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-muted-foreground/60"
					style={{ left: `${LANE_END}%`, top: "50%" }}
				/>
				<span
					className="absolute whitespace-nowrap font-mono text-[11px] text-muted-foreground sm:text-xs"
					style={{ right: `${100 - LANE_END}%`, top: "calc(50% + 22px)" }}
				>
					{DESTINATION}
				</span>
			</div>
		</MotionConfig>
	);
}

const DEVICE_EVENTS = [1, 1.8, 2.6] as const;
const DEVICE_X = [17, 50, 83] as const;

function Phone({
	lit,
	store,
	logo: StoreLogo,
}: {
	lit: boolean;
	store: string;
	logo: Logo;
}) {
	return (
		<div className="flex h-28 w-14 flex-col rounded-[10px] border border-white/15 bg-white/[0.02] p-1 sm:h-36 sm:w-20 sm:p-1.5">
			<motion.div
				animate={{ opacity: lit ? 1 : 0 }}
				className="flex flex-1 flex-col items-center justify-center gap-2"
				initial={false}
				transition={lit ? { duration: 0.45, ease: IN_OUT } : REWIND}
			>
				<StoreLogo aria-hidden className="size-6 text-foreground sm:size-8" />
				<span className="text-[9px] text-muted-foreground sm:text-[10px]">
					{store}
				</span>
			</motion.div>
		</div>
	);
}

function Laptop({ lit }: { lit: boolean }) {
	return (
		<div className="flex flex-col items-center">
			<div className="flex h-20 w-28 flex-col border border-white/15 bg-white/[0.02] sm:h-24 sm:w-40">
				<motion.div
					animate={{ opacity: lit ? 1 : 0 }}
					className="flex flex-1 flex-col"
					initial={false}
					transition={lit ? { duration: 0.45, ease: IN_OUT } : REWIND}
				>
					<span className="truncate border-white/10 border-b px-1.5 py-1 font-mono text-[9px] text-muted-foreground">
						{DESTINATION}
					</span>
					<span className="flex flex-1 items-center justify-center">
						<Image
							alt=""
							className="size-6 sm:size-8"
							height={32}
							src="/brand/logomark/white.svg"
							unoptimized
							width={32}
						/>
					</span>
				</motion.div>
			</div>
			<span className="h-1.5 w-32 bg-white/15 sm:w-48" />
		</div>
	);
}

export function DeviceRoutes() {
	const { ref, step } = useTimeline(DEVICE_EVENTS, 6.4);
	const devices: { name: string; logo: Logo; screen: ReactNode }[] = [
		{
			name: "iPhone",
			logo: SiApple,
			screen: <Phone lit={step >= 1} logo={SiAppstore} store="App Store" />,
		},
		{
			name: "Android",
			logo: SiAndroid,
			screen: <Phone lit={step >= 2} logo={SiGoogleplay} store="Google Play" />,
		},
		{ name: "Desktop", logo: DesktopIcon, screen: <Laptop lit={step >= 3} /> },
	];
	return (
		<MotionConfig reducedMotion="user">
			<div className="flex flex-col items-center" ref={ref}>
				<span className="border border-white/15 px-4 py-2 font-mono text-foreground text-sm">
					{LINK}
				</span>
				<svg
					aria-hidden="true"
					className="h-12 w-full"
					preserveAspectRatio="none"
					viewBox="0 0 100 48"
				>
					{DEVICE_X.map((x, index) => (
						<path
							className={cn(
								"transition-colors duration-500 ease-in-out",
								step > index ? "stroke-foreground/50" : "stroke-white/10"
							)}
							d={`M 50 0 L 50 22 L ${x} 22 L ${x} 48`}
							fill="none"
							key={x}
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					))}
				</svg>
				<div className="grid w-full grid-cols-3 items-end pt-3">
					{devices.map((device, index) => (
						<div className="flex flex-col items-center gap-3" key={device.name}>
							{device.screen}
							<span
								className={cn(
									"flex items-center gap-1.5 text-sm transition-colors duration-500 ease-in-out",
									step > index ? "text-foreground" : "text-muted-foreground"
								)}
							>
								<device.logo aria-hidden className="size-3.5" />
								{device.name}
							</span>
						</div>
					))}
				</div>
			</div>
		</MotionConfig>
	);
}

const VISITS: { agent: string; person: boolean; logo: Logo }[] = [
	{ agent: "Safari on iPhone", person: true, logo: SiSafari },
	{ agent: "Googlebot", person: false, logo: SiGoogle },
	{ agent: "Chrome on Mac", person: true, logo: SiGooglechrome },
	{ agent: "Slackbot", person: false, logo: SlackLogo },
	{ agent: "Firefox on Windows", person: true, logo: SiFirefox },
	{ agent: "Discordbot", person: false, logo: SiDiscord },
];
const VISIT_EVENTS = VISITS.map((_, index) => 0.7 + index * 0.6);
const CLICKS_BEFORE = 57;

export function BotCount() {
	const { ref, step } = useTimeline(VISIT_EVENTS, 6.8);
	const counted = VISITS.slice(0, step).filter((visit) => visit.person).length;
	return (
		<MotionConfig reducedMotion="user">
			<div className={cn(FRAME, "grid sm:grid-cols-[1fr_auto]")} ref={ref}>
				<ul className="flex flex-col px-5 py-4 sm:px-6">
					{VISITS.map((visit, index) => {
						const shown = step > index;
						let opacity = 0.12;
						if (shown) {
							opacity = visit.person ? 1 : 0.45;
						}
						return (
							<motion.li
								animate={{ opacity }}
								className="flex items-center justify-between gap-4 py-2"
								initial={false}
								key={visit.agent}
								transition={shown ? { duration: 0.4, ease: IN_OUT } : REWIND}
							>
								<span className="flex items-center gap-3 text-sm">
									<visit.logo
										aria-hidden
										className={cn(
											"size-4 shrink-0",
											visit.person ? "text-foreground" : "text-muted-foreground"
										)}
									/>
									<span
										className={
											visit.person ? "text-foreground" : "text-muted-foreground"
										}
									>
										{visit.agent}
									</span>
								</span>
								{visit.person && (
									<span className="font-mono text-foreground text-xs">+1</span>
								)}
							</motion.li>
						);
					})}
				</ul>
				<div className="flex flex-col justify-center gap-1 border-white/[0.06] border-t px-5 py-5 sm:border-t-0 sm:border-l sm:px-10">
					<span className="font-semibold text-5xl text-foreground tracking-tight sm:text-6xl">
						<Count value={CLICKS_BEFORE + counted} />
					</span>
					<span className="text-muted-foreground text-sm">clicks</span>
				</div>
			</div>
		</MotionConfig>
	);
}

const QR_SIZE = 21;
const FINDERS = [
	[0, 0],
	[0, QR_SIZE - 7],
	[QR_SIZE - 7, 0],
] as const;

const qrCellIsDark = (row: number, column: number) => {
	for (const [top, left] of FINDERS) {
		if (
			row >= top - 1 &&
			row <= top + 7 &&
			column >= left - 1 &&
			column <= left + 7
		) {
			const y = row - top;
			const x = column - left;
			if (y < 0 || y > 6 || x < 0 || x > 6) {
				return false;
			}
			const ring = y === 0 || y === 6 || x === 0 || x === 6;
			const center = y >= 2 && y <= 4 && x >= 2 && x <= 4;
			return ring || center;
		}
	}
	return pseudoRandom(`qr-${row}-${column}`) < 0.5;
};

const QR_PATH = Array.from({ length: QR_SIZE * QR_SIZE }, (_, index) => ({
	row: Math.floor(index / QR_SIZE),
	column: index % QR_SIZE,
}))
	.filter(({ row, column }) => qrCellIsDark(row, column))
	.map(({ row, column }) => `M${column} ${row}h1v1h-1z`)
	.join("");

const REPOINT_EVENTS = [1.6, 2.4] as const;

export function RepointQr() {
	const { ref, step } = useTimeline(REPOINT_EVENTS, 6.2);
	const moved = step >= 1;
	const landed = step >= 2;
	return (
		<MotionConfig reducedMotion="user">
			<div
				className="flex flex-col items-center gap-8 sm:flex-row sm:justify-center sm:gap-6"
				ref={ref}
			>
				<div className="flex flex-col items-center gap-3 border border-white/10 bg-white/[0.02] p-5 sm:p-6">
					<svg
						aria-hidden="true"
						className="size-28 fill-foreground sm:size-32"
						shapeRendering="crispEdges"
						viewBox={`-1 -1 ${QR_SIZE + 2} ${QR_SIZE + 2}`}
					>
						<path d={QR_PATH} />
					</svg>
					<span className="font-mono text-foreground text-sm">{LINK}</span>
				</div>
				<span className="hidden h-px w-12 bg-white/15 sm:block" />
				<div className="flex flex-col gap-3 font-mono text-sm">
					<span
						className={cn(
							"transition-colors duration-300 ease-in-out",
							moved ? "text-muted-foreground line-through" : "text-foreground"
						)}
					>
						{DESTINATION}/waitlist
					</span>
					<motion.span
						animate={{ opacity: landed ? 1 : 0.12, x: landed ? 0 : -4 }}
						className="text-foreground"
						initial={false}
						transition={landed ? { duration: 0.45, ease: IN_OUT } : REWIND}
					>
						{DESTINATION}/pricing
					</motion.span>
				</div>
			</div>
		</MotionConfig>
	);
}

const UTM = [
	{ key: "utm_source", value: "newsletter" },
	{ key: "utm_medium", value: "email" },
	{ key: "utm_campaign", value: "launch" },
] as const;
const UTM_EVENTS = [1, 1.7, 2.4] as const;

export function UtmTags() {
	const { ref, step } = useTimeline(UTM_EVENTS, 6.2);
	return (
		<MotionConfig reducedMotion="user">
			<div className={cn(FRAME, "flex flex-col")} ref={ref}>
				<span className="border-white/[0.06] border-b px-5 py-4 font-mono text-base text-foreground sm:px-6 sm:text-lg">
					{LINK}
				</span>
				<p className="px-5 py-5 font-mono text-xs leading-7 sm:px-6 sm:text-sm">
					<span className="text-muted-foreground">
						https://{DESTINATION}/launch
					</span>
					{UTM.map((tag, index) => (
						<motion.span
							animate={{
								clipPath:
									step > index ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)",
							}}
							className="inline-block"
							initial={false}
							key={tag.key}
							transition={
								step > index ? { duration: 0.5, ease: IN_OUT } : REWIND
							}
						>
							<span className="text-muted-foreground">
								{index === 0 ? "?" : "&"}
								{tag.key}=
							</span>
							<span className="text-brand-amber">{tag.value}</span>
						</motion.span>
					))}
				</p>
			</div>
		</MotionConfig>
	);
}
