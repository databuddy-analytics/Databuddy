"use client";

import {
	ArrowRightIcon,
	BugIcon,
	ChartActivityIcon,
	CursorClickIcon,
	FlagIcon,
	FunnelIcon,
	GaugeIcon,
	UsersIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import {
	AnimatePresence,
	motion,
	useInView,
	useReducedMotion,
} from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Count, FRAME, IN_OUT } from "./landing/demo-primitives";

const BentoCard = ({
	title,
	description,
	icon: Icon,
	children,
	className,
	contentClassName,
	href,
}: {
	title: string;
	description?: string;
	icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
	href?: string;
}) => (
	<div className={cn(FRAME, "group relative overflow-hidden", className)}>
		<CardHeader className="relative z-20 px-6 py-4">
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-3">
					<div className="flex size-8 items-center justify-center border border-white/[0.06] bg-white/[0.02]">
						<Icon className="size-4 text-muted-foreground" />
					</div>
					<div className="flex flex-col gap-0.5">
						<CardTitle className="font-medium text-foreground text-sm">
							{title}
						</CardTitle>
						{description && (
							<p className="text-muted-foreground text-xs">{description}</p>
						)}
					</div>
				</div>
				{href && (
					<Link
						aria-label={`Learn more about ${title}`}
						className="z-30 flex size-10 shrink-0 items-center justify-center border border-white/[0.06] bg-white/[0.02] text-muted-foreground transition-colors duration-200 ease-in-out hover:border-white/[0.12] hover:text-foreground"
						href={href}
					>
						<ArrowRightIcon className="size-5" />
					</Link>
				)}
			</div>
		</CardHeader>
		<CardContent className={cn("relative z-10 p-6 pt-0", contentClassName)}>
			{children}
		</CardContent>
	</div>
);

const useTick = (seconds: number, live: boolean, offsetSeconds = 0) => {
	const [tick, setTick] = useState(0);
	useEffect(() => {
		if (!live) {
			return;
		}
		let interval: number | undefined;
		const start = window.setTimeout(() => {
			setTick((current) => current + 1);
			interval = window.setInterval(
				() => setTick((current) => current + 1),
				seconds * 1000
			);
		}, offsetSeconds * 1000);
		return () => {
			window.clearTimeout(start);
			if (interval !== undefined) {
				window.clearInterval(interval);
			}
		};
	}, [live, seconds, offsetSeconds]);
	return tick;
};

const buildSmoothPath = (values: number[], width: number, height: number) => {
	const pts = values.map((v, i) => ({
		x: (i / (values.length - 1)) * width,
		y: height - (v / 100) * height,
	}));
	let d = `M ${pts[0].x} ${pts[0].y}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = pts[Math.max(0, i - 1)];
		const p1 = pts[i];
		const p2 = pts[i + 1];
		const p3 = pts[Math.min(pts.length - 1, i + 2)];
		const c1x = p1.x + (p2.x - p0.x) / 6;
		const c1y = p1.y + (p2.y - p0.y) / 6;
		const c2x = p2.x - (p3.x - p1.x) / 6;
		const c2y = p2.y - (p3.y - p1.y) / 6;
		d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
	}
	return d;
};

const FUNNEL_STAGES = [
	{ value: 100, name: "Pricing view", fill: "var(--primary)" },
	{ value: 41, name: "Signup", fill: "var(--muted-foreground)" },
	{ value: 22, name: "Website added", fill: "var(--accent)" },
	{ value: 13, name: "Script live", fill: "var(--secondary)" },
] as const;

const FunnelsFeature = () => (
	<div className="flex w-full min-w-0 flex-col">
		<div className="mb-4 flex items-center justify-between">
			<div className="space-y-1">
				<div className="font-medium text-3xl text-foreground tracking-tighter">
					13%
				</div>
				<div className="text-muted-foreground text-xs">Conversion rate</div>
			</div>
			<Badge variant="gray">+2.4%</Badge>
		</div>
		<div className="flex h-[320px] w-full flex-col gap-1">
			{FUNNEL_STAGES.map((stage, i) => {
				const top = stage.value * 0.5;
				const bottom = (FUNNEL_STAGES[i + 1]?.value ?? stage.value) * 0.5;
				const points = `${(100 - top) / 2},0 ${(100 + top) / 2},0 ${(100 + bottom) / 2},80 ${(100 - bottom) / 2},80`;
				return (
					<div className="relative min-h-0 flex-1 py-1" key={stage.name}>
						<svg
							aria-hidden="true"
							className="h-full w-full"
							preserveAspectRatio="none"
							viewBox="0 0 100 80"
						>
							<polygon fill={stage.fill} points={points} />
						</svg>
						<span
							className="absolute top-1/2 -translate-y-1/2 font-medium font-mono text-muted-foreground text-xs"
							style={{ left: `calc(${(100 + top) / 2}% + 12px)` }}
						>
							{stage.name}
						</span>
					</div>
				);
			})}
		</div>
	</div>
);

const TRAFFIC = [
	42, 46, 51, 49, 55, 61, 58, 64, 70, 67, 73, 78, 74, 69, 63, 66, 72, 77, 81,
	76, 70, 64, 58, 52,
] as const;
const TRAFFIC_WINDOW = 12;

const RealTimeFeature = ({ live }: { live: boolean }) => {
	const tick = useTick(2.5, live);
	const values = Array.from(
		{ length: TRAFFIC_WINDOW },
		(_, index) => TRAFFIC[(tick + index) % TRAFFIC.length]
	);
	const linePath = buildSmoothPath(values, 300, 120);
	const liveUsers = 90 + Math.round((values.at(-1) ?? 0) * 0.6);

	return (
		<div className="relative flex h-full flex-col">
			<div className="relative z-10 space-y-1 px-6">
				<div className="flex items-center gap-2">
					<span className="relative flex size-2">
						<motion.span
							animate={{
								scale: [1, 1.5, 1],
								opacity: [0.75, 0, 0.75],
							}}
							className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
							transition={{
								duration: 2,
								ease: IN_OUT,
								repeat: Number.POSITIVE_INFINITY,
							}}
						/>
						<span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
					</span>
					<span className="text-muted-foreground text-xs">Live users</span>
				</div>
				<Count
					className="font-medium font-mono text-2xl text-foreground tracking-tighter"
					value={liveUsers}
				/>
			</div>
			<div className="mt-auto h-[120px] w-full">
				<svg
					aria-hidden="true"
					className="h-full w-full"
					preserveAspectRatio="none"
					viewBox="0 0 300 120"
				>
					<defs>
						<linearGradient id="colorRealTime" x1="0" x2="0" y1="0" y2="1">
							<stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
							<stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
						</linearGradient>
					</defs>
					<motion.path
						animate={{ d: `${linePath} L 300 120 L 0 120 Z` }}
						fill="url(#colorRealTime)"
						initial={false}
						transition={{ duration: 0.8, ease: IN_OUT }}
					/>
					<motion.path
						animate={{ d: linePath }}
						fill="none"
						initial={false}
						stroke="var(--primary)"
						strokeWidth={2}
						style={{ filter: "drop-shadow(0 0 5px var(--primary))" }}
						transition={{ duration: 0.8, ease: IN_OUT }}
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
			</div>
		</div>
	);
};

const SESSIONS = [
	{ path: "/docs/getting-started", browser: "Chrome", os: "macOS", flag: "🇺🇸" },
	{ path: "/pricing", browser: "Safari", os: "iOS", flag: "🇩🇪" },
	{ path: "/databunny", browser: "Firefox", os: "Windows", flag: "🇬🇧" },
	{ path: "/compare/posthog", browser: "Chrome", os: "Android", flag: "🇮🇳" },
	{ path: "/docs/sdk/mcp", browser: "Arc", os: "macOS", flag: "🇫🇷" },
	{ path: "/changelog", browser: "Safari", os: "macOS", flag: "🇳🇱" },
	{ path: "/errors", browser: "Chrome", os: "Windows", flag: "🇧🇷" },
] as const;
const SESSION_ROWS = 6;
const SESSION_AGES = [
	"Just now",
	"1m ago",
	"3m ago",
	"6m ago",
	"9m ago",
	"12m ago",
];

const SessionsFeature = ({ live }: { live: boolean }) => {
	const tick = useTick(6, live);
	const rows = Array.from({ length: SESSION_ROWS }, (_, index) => {
		const session =
			SESSIONS[(tick - index + SESSIONS.length * 64) % SESSIONS.length];
		return { ...session, age: SESSION_AGES[index], position: tick - index };
	});

	return (
		<div className="space-y-2">
			<AnimatePresence initial={false} mode="popLayout">
				{rows.map((session) => (
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="flex items-center justify-between border border-white/[0.06] bg-white/[0.02] p-2 text-sm"
						exit={{ opacity: 0 }}
						initial={{ opacity: 0, y: -12 }}
						key={session.position}
						layout
						transition={{ duration: 0.5, ease: IN_OUT }}
					>
						<div className="flex items-center gap-3.5">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-lg grayscale">
								{session.flag}
							</div>
							<div className="flex flex-col gap-1">
								<span className="font-medium font-mono text-accent-foreground text-xs">
									{session.path}
								</span>
								<span className="font-mono text-muted-foreground text-xs">
									{session.browser} · {session.os}
								</span>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<div className="size-1.5 rounded-full bg-emerald-400" />
							<span className="font-mono text-muted-foreground text-xs">
								{session.age}
							</span>
						</div>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
};

const ERROR_BARS = [40, 70, 30, 80, 50, 90, 60, 40, 65, 85, 45, 75] as const;

const ErrorTrackingFeature = () => (
	<div className="flex h-full flex-1 flex-col">
		<div className="border border-white/[0.06] bg-white/[0.02] p-4">
			<div className="flex items-start gap-3">
				<div className="rounded-md bg-destructive/10 p-2">
					<WarningCircleIcon className="size-4 shrink-0 text-destructive" />
				</div>
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex items-center justify-between gap-2">
						<p className="truncate font-medium font-mono text-[11px] text-accent-foreground">
							TypeError: Cannot read &apos;plan&apos; of undefined
						</p>
						<Badge variant="destructive">
							<span className="font-mono text-[10px]">CRITICAL</span>
						</Badge>
					</div>
					<p className="truncate rounded border border-border bg-background/50 p-1.5 font-mono text-[10px] text-muted-foreground">
						/pricing at app/(home)/pricing/_pricing/table.tsx:88:11
					</p>
				</div>
			</div>
		</div>

		<div className="mt-5 flex flex-col">
			<div className="flex justify-between px-1 text-muted-foreground text-xs">
				<span>Last 24 hours</span>
				<span>12 affected</span>
			</div>
			<div className="mt-4 flex h-12 items-end gap-1">
				{ERROR_BARS.map((height, index) => (
					<div
						className="flex-1 rounded-t-[1px] bg-red-400/70"
						key={`bar-${height}-${index}`}
						style={{ height: `${height}%` }}
					/>
				))}
			</div>
		</div>
	</div>
);

const FLAGS = [
	{ name: "onboarding-plan-step", enabled: true, env: "25% rollout" },
	{ name: "databunny-chat", enabled: true, env: "100% rollout" },
	{ name: "pricing-estimator", enabled: false, env: "Off" },
] as const;

const FeatureFlagsFeature = () => (
	<div className="space-y-2">
		{FLAGS.map((flag) => (
			<div
				className="flex items-center justify-between border border-white/[0.06] bg-white/[0.02] p-3"
				key={flag.name}
			>
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<div
						className={cn(
							"size-2 shrink-0 rounded-full ring-4",
							flag.enabled
								? "bg-emerald-400 ring-emerald-400/20"
								: "bg-muted ring-muted-foreground/30"
						)}
					/>
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="truncate font-medium font-mono text-accent-foreground text-xs">
							{flag.name}
						</span>
						<span className="text-[11px] text-muted-foreground">
							{flag.env}
						</span>
					</div>
				</div>
				<Switch checked={flag.enabled} className="min-h-0! min-w-0!" disabled />
			</div>
		))}
	</div>
);

// p75 for databuddy.cc, 30 days to Oct 16 2026; all three are inside the Good band
const WEB_VITALS_METRICS = [
	{ label: "LCP", value: "2.1s", rating: "Good" },
	{ label: "INP", value: "144ms", rating: "Good" },
	{ label: "CLS", value: "0.00", rating: "Good" },
] as const;

const WebVitalsFeature = () => (
	<div className="grid h-[150px] grid-cols-3 gap-3">
		{WEB_VITALS_METRICS.map((m) => (
			<div
				className="angled-rectangle-gradient flex h-full flex-col items-center justify-between gap-2 border border-white/[0.06] border-b-0 p-3"
				key={m.label}
			>
				<div className="relative flex size-14 items-center justify-center">
					<svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
						<title>Score indicator</title>
						<circle
							className="stroke-secondary"
							cx="18"
							cy="18"
							fill="none"
							r="16"
							strokeWidth="2.5"
						/>
						<circle
							className="stroke-emerald-400"
							cx="18"
							cy="18"
							fill="none"
							pathLength="100"
							r="16"
							strokeLinecap="round"
							strokeWidth="2.5"
						/>
					</svg>
					<span className="absolute font-medium font-mono text-foreground text-xs">
						{m.value}
					</span>
				</div>
				<div className="space-y-0.5 text-center">
					<div className="font-medium text-foreground text-xs">{m.label}</div>
					<div className="text-emerald-400 text-xs">{m.rating}</div>
				</div>
			</div>
		))}
	</div>
);

const EVENTS = [
	{ name: "signup_cta_clicked", base: 1284, step: 3 },
	{ name: "demo_opened", base: 836, step: 2 },
	{ name: "website_added", base: 412, step: 1 },
] as const;

const CustomEventsFeature = ({ live }: { live: boolean }) => {
	const tick = useTick(6, live, 3);

	return (
		<div className="space-y-2">
			{EVENTS.map((event) => (
				<div
					className="flex items-center justify-between border border-white/[0.06] bg-white/[0.02] p-2 text-xs"
					key={event.name}
				>
					<div className="flex items-center gap-3">
						<div className="rounded-md border border-border bg-background p-2 text-muted-foreground">
							<CursorClickIcon className="size-3" />
						</div>
						<span className="font-mono text-muted-foreground">
							{event.name}
						</span>
					</div>
					<Badge variant="gray">
						<Count value={event.base + tick * event.step} />
					</Badge>
				</div>
			))}
		</div>
	);
};

export default function Bento() {
	const ref = useRef<HTMLDivElement>(null);
	const visible = useInView(ref, { amount: 0.2 });
	const reduce = useReducedMotion();
	const live = visible && !reduce;

	return (
		<div
			className="grid h-full w-full grid-cols-1 gap-4 p-1 md:grid-cols-12"
			ref={ref}
		>
			<BentoCard
				className="h-full md:col-span-4 md:row-span-2"
				description="Track user journeys through your app"
				href="/demo"
				icon={FunnelIcon}
				title="Conversion funnels"
			>
				<FunnelsFeature />
			</BentoCard>

			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				contentClassName="px-0 pb-0"
				description="See who's on your site right now"
				href="/docs/dashboard"
				icon={ChartActivityIcon}
				title="Real-time"
			>
				<RealTimeFeature live={live} />
			</BentoCard>

			<BentoCard
				className="h-full md:col-span-4 md:row-span-2"
				description="See each session's page, country, and browser"
				href="/docs/dashboard"
				icon={UsersIcon}
				title="Sessions"
			>
				<SessionsFeature live={live} />
			</BentoCard>

			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				contentClassName="pb-0"
				description="Monitor core performance metrics"
				href="/web-vitals"
				icon={GaugeIcon}
				title="Web Vitals"
			>
				<WebVitalsFeature />
			</BentoCard>

			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				description="Catch and fix bugs fast"
				href="/errors"
				icon={BugIcon}
				title="Error tracking"
			>
				<ErrorTrackingFeature />
			</BentoCard>

			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				description="Roll out features safely"
				href="/feature-flags"
				icon={FlagIcon}
				title="Feature flags"
			>
				<FeatureFlagsFeature />
			</BentoCard>

			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				description="Track what matters to you"
				href="/docs/dashboard#custom-events-analytics"
				icon={CursorClickIcon}
				title="Events"
			>
				<CustomEventsFeature live={live} />
			</BentoCard>
		</div>
	);
}
