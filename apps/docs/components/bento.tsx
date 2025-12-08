"use client";

import {
	ActivityIcon,
	Bug,
	CursorClick,
	Flag,
	Funnel,
	Gauge,
	Users,
	WarningCircle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
	Area,
	AreaChart,
	FunnelChart,
	Funnel as FunnelRecharts,
	LabelList,
	ResponsiveContainer,
	Tooltip,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const BentoCard = ({
	title,
	description,
	icon: Icon,
	children,
	className,
	headerClassName,
	contentClassName,
}: {
	title: string;
	description?: string;
	icon: any;
	children: React.ReactNode;
	className?: string;
	headerClassName?: string;
	contentClassName?: string;
}) => (
	<motion.div
		className={cn(
			"group relative overflow-hidden border border-border bg-card backdrop-blur-xl duration-500",
			className
		)}
		initial={{ opacity: 0, y: 20 }}
		transition={{ duration: 0.5, ease: "easeOut" }}
		viewport={{ once: true }}
		whileInView={{ opacity: 1, y: 0 }}
	>
		<CardHeader className={cn("relative z-20 px-6 py-4", headerClassName)}>
			<div className="flex items-center gap-3">
				<div className="flex size-8 items-center justify-center bg-secondary/40 ring-1 ring-border">
					<Icon className="size-4 text-muted-foreground" weight="duotone" />
				</div>
				<div className="flex flex-col gap-0.5">
					<CardTitle className="font-medium font-mono text-foreground text-sm">
						{title}
					</CardTitle>
					{description && (
						<p className="font-mono text-muted-foreground text-xs">
							{description}
						</p>
					)}
				</div>
			</div>
		</CardHeader>
		<CardContent className={cn("relative z-10 p-6 pt-0", contentClassName)}>
			{children}
		</CardContent>
	</motion.div>
);

const FunnelsFeature = () => {
	const data = [
		{
			value: 100,
			name: "Page View",

			fill: "var(--primary)",
			stroke: "var(--primary)",
		},
		{
			value: 65,
			name: "Sign Up",
			fill: "var(--muted-foreground)",
			stroke: "var(--muted-foreground)",
		},
		{
			value: 45,
			name: "Onboarding",
			fill: "var(--accent)",
			stroke: "var(--accent)",
		},
		{
			value: 25,
			name: "Paid",
			fill: "var(--secondary)",
			stroke: "var(--secondary)",
		},
	];

	return (
		<div className="flex w-full min-w-0 flex-col">
			<div className="mb-4 flex items-center justify-between">
				<div className="space-y-1">
					<motion.div
						animate={{ opacity: 1, scale: 1 }}
						className="font-medium not-[]:font-mono text-3xl text-foreground tracking-tighter"
						initial={{ opacity: 0, scale: 0.5 }}
						transition={{ duration: 0.5, delay: 0.2 }}
					>
						24.5%
					</motion.div>
					<div className="font-medium font-mono text-muted-foreground text-xs uppercase tracking-widest">
						Conversion Rate
					</div>
				</div>
				<Badge variant="gray">+2.4%</Badge>
			</div>
			<div
				className="h-[320px] w-full"
				style={{
					maskImage: "linear-gradient(to bottom, black 20%, transparent 100%)",
				}}
			>
				<ResponsiveContainer height="100%" width="100%">
					<FunnelChart>
						<Tooltip
							contentStyle={{
								borderRadius: "4px",
								border: "1px solid var(--border)",
								backgroundColor: "var(--popover)",
								backdropFilter: "blur(8px)",
								fontSize: "12px",
								color: "var(--popover-foreground)",
								boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
								fontFamily: "var(--font-mono)",
							}}
							cursor={{ fill: "transparent" }}
							itemStyle={{ color: "var(--popover-foreground)" }}
						/>
						<FunnelRecharts
							data={data}
							dataKey="value"
							isAnimationActive
							lastShapeType="rectangle"
						>
							<LabelList
								className="fill-muted-foreground font-medium font-mono text-xs"
								dataKey="name"
								offset={20}
								position="right"
								stroke="none"
							/>
						</FunnelRecharts>
					</FunnelChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
};

const RealTimeFeature = () => {
	const [data, setData] = useState([
		{ value: 30 },
		{ value: 45 },
		{ value: 35 },
		{ value: 50 },
		{ value: 40 },
		{ value: 60 },
		{ value: 55 },
		{ value: 70 },
		{ value: 65 },
		{ value: 80 },
		{ value: 75 },
		{ value: 90 },
	]);
	const [liveUsers, setLiveUsers] = useState(142);

	useEffect(() => {
		const interval = setInterval(() => {
			setData((prev) => {
				const nextValue = 40 + Math.random() * 50;
				const next = [...prev.slice(1), { value: nextValue }];

				// Update live users count based on the new data point with some smoothing
				setLiveUsers(Math.floor(100 + nextValue * 0.8));

				return next;
			});
		}, 2000);
		return () => clearInterval(interval);
	}, []);

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
							className="absolute inline-flex h-full w-full rounded-full bg-muted-foreground opacity-75"
							transition={{
								duration: 2,
								repeat: Number.POSITIVE_INFINITY,
							}}
						/>
						<span className="relative inline-flex size-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
					</span>
					<span className="font-medium font-mono text-muted-foreground text-xs uppercase tracking-widest">
						Live Users
					</span>
				</div>
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className="font-medium font-mono text-2xl text-foreground tracking-tighter"
					initial={{ opacity: 0.5, y: 5 }}
					key={liveUsers}
				>
					{liveUsers}
				</motion.div>
			</div>
			<div className="mt-auto h-[120px] w-full">
				<ResponsiveContainer height="100%" width="100%">
					<AreaChart
						data={data}
						margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
					>
						<defs>
							<linearGradient id="colorRealTime" x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="0%"
									stopColor="var(--primary)"
									stopOpacity={0.3}
								/>
								<stop
									offset="100%"
									stopColor="var(--primary)"
									stopOpacity={0}
								/>
							</linearGradient>
						</defs>
						<Area
							animationDuration={1000}
							dataKey="value"
							fill="url(#colorRealTime)"
							isAnimationActive={true}
							stroke="var(--primary)"
							strokeWidth={2}
							style={{
								filter: "drop-shadow(0 0 5px var(--primary))",
							}}
							type="monotone"
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
};

const SessionsFeature = () => {
	const [sessions, setSessions] = useState([
		{
			id: "1",
			country: "US",
			browser: "Chrome",
			os: "Mac OS",
			time: "2m ago",
			path: "/pricing",
			flag: "🇺🇸",
		},
		{
			id: "2",
			country: "DE",
			browser: "Firefox",
			os: "Windows",
			time: "5m ago",
			path: "/docs/api",
			flag: "🇩🇪",
		},
		{
			id: "3",
			country: "JP",
			browser: "Safari",
			os: "iOS",
			time: "8m ago",
			path: "/blog/v2",
			flag: "🇯🇵",
		},
		{
			id: "4",
			country: "GB",
			browser: "Chrome",
			os: "Android",
			time: "12m ago",
			path: "/features",
			flag: "🇬🇧",
		},
		{
			id: "5",
			country: "FR",
			browser: "Safari",
			os: "iOS",
			time: "15m ago",
			path: "/blog/v2",
			flag: "🇫🇷",
		},
		{
			id: "6",
			country: "IT",
			browser: "Safari",
			os: "iOS",
			time: "18m ago",
			path: "/blog/v2",
			flag: "🇮🇹",
		},
		{
			id: "7",
			country: "ES",
			browser: "Safari",
			os: "iOS",
			time: "21m ago",
			path: "/blog/v2",
			flag: "🇪🇸",
		},
	]);

	useEffect(() => {
		const interval = setInterval(() => {
			setSessions((prev) => {
				// Move first item to end and update time
				const [first, ...rest] = prev;
				// Generate a new random ID to force re-render/animation if needed
				return [
					...rest,
					{ ...first, time: "Just now", id: Math.random().toString() },
				];
			});
		}, 3000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div
			className="relative max-h-[380px] overflow-hidden"
			style={{
				maskImage:
					"linear-gradient(to bottom, transparent 0%, black 10%, black 75%, transparent 100%)",
			}}
		>
			<div className="space-y-2">
				<AnimatePresence initial={false} mode="popLayout">
					{sessions.map((session) => (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="group flex items-center justify-between border border-border/50 bg-secondary/20 p-2 text-sm"
							exit={{ y: -60 }}
							initial={{ opacity: 0, y: 60 }}
							key={session.id}
							layout
							transition={{
								layout: { duration: 0.4, ease: "easeInOut" },
								y: { duration: 0.4, ease: "easeOut" },
							}}
						>
							<div className="flex items-center gap-3.5">
								<div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-lg grayscale backdrop-blur-sm">
									{session.flag}
								</div>
								<div className="flex flex-col gap-1">
									<span className="font-medium font-mono text-accent-foreground text-xs group-hover:text-foreground">
										{session.path}
									</span>
									<span className="font-mono text-muted-foreground text-xs">
										{session.browser} • {session.os}
									</span>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
								<span className="font-mono text-muted-foreground text-xs">
									{session.time}
								</span>
							</div>
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</div>
	);
};

const ErrorTrackingFeature = () => (
	<div className="flex h-full flex-1 flex-col">
		<div className="relative overflow-hidden border border-border bg-secondary/20 p-4 transition-all">
			<div className="flex items-start gap-3">
				<div className="rounded-md bg-destructive/10 p-2">
					<motion.div
						animate={{ scale: [1, 1.2, 1] }}
						transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
					>
						<WarningCircle
							className="size-4 shrink-0 text-destructive"
							weight="fill"
						/>
					</motion.div>
				</div>
				<div className="min-w-0 flex-1 space-y-2">
					<div className="flex items-center justify-between gap-2">
						<p className="truncate font-medium font-mono text-[11px] text-accent-foreground">
							TypeError: undefined is not a function
						</p>
						<Badge variant="destructive">
							<motion.span
								animate={{ opacity: [1, 0.5, 1] }}
								className="font-mono text-[10px]"
								transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
							>
								CRITICAL
							</motion.span>
						</Badge>
					</div>
					<p className="rounded border border-border bg-background/50 p-1.5 font-mono text-[10px] text-muted-foreground">
						at /app/layout.tsx:42:15
					</p>
				</div>
			</div>
		</div>

		<div className="mt-5 flex flex-col">
			<div className="flex justify-between px-1 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
				<span>Last 24 hours</span>
				<span>12 Affected</span>
			</div>
			{/* Abstract impact graph */}
			<div className="mt-6 flex h-14 items-end gap-1 opacity-60">
				{[40, 70, 30, 80, 50, 90, 60, 40, 65, 85, 45, 75].map((h, i) => (
					<motion.div
						animate={{ height: `${h}%` }}
						className="flex-1 rounded-t-[1px] bg-accent-foreground duration-300 hover:bg-accent-foreground/50"
						initial={{ height: 0 }}
						key={i}
						transition={{ duration: 0.5, delay: i * 0.05 }}
					/>
				))}
			</div>
		</div>
	</div>
);

const FeatureFlagsFeature = () => {
	const flags = [
		{ name: "New Dashboard", enabled: true, env: "prod" },
		{ name: "AI Assistant", enabled: false, env: "beta" },
		{ name: "Dark Mode V2", enabled: true, env: "dev" },
		{ name: "Analytics V3", enabled: true, env: "prod" },
	];

	return (
		<div
			className="max-h-[180px] space-y-2"
			style={{
				maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
			}}
		>
			{flags.map((flag, i) => (
				<div
					className="group flex items-center justify-between border border-border/50 bg-secondary/20 p-3 transition-all"
					key={i}
				>
					<div className="flex min-w-0 flex-1 items-center gap-3">
						<div
							className={cn(
								"size-2 shrink-0 rounded-full ring-4 ring-opacity-20 transition-all duration-300",
								flag.enabled
									? "bg-primary shadow-[0_0_12px_var(--primary)] ring-primary/30"
									: "bg-muted ring-muted-foreground/30"
							)}
						>
							{flag.enabled && (
								<motion.div
									animate={{ scale: 1 }}
									className="h-full w-full rounded-full bg-primary"
									initial={{ scale: 0 }}
								/>
							)}
						</div>
						<div className="flex min-w-0 flex-col gap-0.5">
							<span className="truncate font-medium font-mono text-accent-foreground text-xs group-hover:text-foreground">
								{flag.name}
							</span>
							<span className="font-medium font-mono text-[9px] text-muted-foreground uppercase tracking-widest">
								{flag.env}
							</span>
						</div>
					</div>
					<Switch
						checked={flag.enabled}
						className="min-h-0! min-w-0!"
						disabled
					/>
				</div>
			))}
		</div>
	);
};

const WebVitalsFeature = () => {
	const [animatedScores, setAnimatedScores] = useState([0, 0, 0]);
	const metrics = [
		{
			label: "LCP",
			value: "0.8s",
			score: 98,
		},
		{
			label: "FID",
			value: "12ms",
			score: 100,
		},
		{
			label: "CLS",
			value: "0.02",
			score: 95,
		},
	];

	const [isComplete, setIsComplete] = useState(false);

	useEffect(() => {
		const duration = 1800;
		const steps = 60;
		const interval = duration / steps;

		let step = 0;
		const timer = setInterval(() => {
			step += 1;
			const progress = step / steps;
			// More dramatic easing - starts slow, accelerates, then settles
			const eased = 1 - (1 - progress) ** 4;

			setAnimatedScores(metrics.map((m) => Math.round(m.score * eased)));

			if (step >= steps) {
				clearInterval(timer);
				setIsComplete(true);
			}
		}, interval);

		return () => clearInterval(timer);
	}, []);

	return (
		<div className="grid h-[150px] grid-cols-3 gap-3">
			{metrics.map((m, i) => (
				<motion.div
					animate={{ opacity: 1, y: 0 }}
					className={cn(
						"angled-rectangle-gradient flex h-full flex-col items-center justify-between gap-2 border border-border border-b-0 p-3 transition-all"
					)}
					initial={{ opacity: 0, y: 20 }}
					key={m.label}
					transition={{ duration: 0.5, delay: i * 0.15, ease: "easeOut" }}
				>
					<div className="relative flex size-14 items-center justify-center">
						<svg className="-rotate-90 h-full w-full" viewBox="0 0 36 36">
							<title>Score indicator</title>
							{/* Background track */}
							<circle
								className="stroke-secondary"
								cx="18"
								cy="18"
								fill="none"
								r="16"
								strokeWidth="2.5"
							/>
							{/* Glow effect layer */}
							<motion.circle
								animate={{
									strokeDashoffset: 100 - m.score,
								}}
								className="stroke-primary"
								cx="18"
								cy="18"
								fill="none"
								initial={{ strokeDashoffset: 100 }}
								pathLength="100"
								r="16"
								strokeLinecap="round"
								strokeWidth="2.5"
								style={{ opacity: 0.5 }}
								transition={{
									strokeDashoffset: {
										duration: 1.8,
										delay: i * 0.25,
										ease: [0.16, 1, 0.3, 1],
									},
									filter: { duration: 0.5, delay: 1.8 + i * 0.25 },
								}}
							/>
							{/* Main progress circle */}
							<motion.circle
								animate={{
									strokeDashoffset: 100 - m.score,
								}}
								className="stroke-primary"
								cx="18"
								cy="18"
								fill="none"
								initial={{ strokeDashoffset: 100 }}
								pathLength="100"
								r="16"
								strokeLinecap="round"
								strokeWidth="2.5"
								transition={{
									duration: 1.8,
									delay: i * 0.25,
									ease: [0.16, 1, 0.3, 1],
								}}
							/>
						</svg>
						{/* Animated score number */}
						<motion.span
							animate={{
								scale: isComplete ? [1, 1.1, 1] : 1,
							}}
							className="absolute font-medium font-mono text-foreground text-sm"
							transition={{ duration: 0.3, delay: 1.8 + i * 0.25 }}
						>
							{animatedScores[i]}
						</motion.span>
					</div>
					<div className="space-y-0.5 text-center">
						<motion.div
							animate={{ opacity: 1 }}
							className="font-bold font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
							initial={{ opacity: 0 }}
							transition={{ duration: 0.3, delay: 0.3 + i * 0.15 }}
						>
							{m.label}
						</motion.div>
						<motion.div
							animate={{ opacity: 0.9 }}
							className="font-medium font-mono text-foreground text-xs"
							initial={{ opacity: 0 }}
							transition={{ duration: 0.3, delay: 0.5 + i * 0.15 }}
						>
							{m.value}
						</motion.div>
					</div>
				</motion.div>
			))}
		</div>
	);
};

const CustomEventsFeature = () => {
	const [events, setEvents] = useState([
		{ name: "checkout_completed", count: "2.4k", id: "1" },
		{ name: "add_to_cart", count: "8.9k", id: "2" },
		{ name: "video_played", count: "12k", id: "3" },
		{ name: "signup_started", count: "5.2k", id: "4" },
		{ name: "button_clicked", count: "15k", id: "5" },
		{ name: "form_submitted", count: "10k", id: "6" },
		{ name: "link_clicked", count: "18k", id: "7" },
		{ name: "search_performed", count: "9.5k", id: "8" },
		{ name: "product_viewed", count: "13k", id: "9" },
		{ name: "payment_successful", count: "7.8k", id: "10" },
	]);

	useEffect(() => {
		const interval = setInterval(() => {
			setEvents((prev) => {
				const [first, ...rest] = prev;
				// Generate new count and ID for cycling effect
				const newCount = `${(Math.random() * 20).toFixed(1)}k`;
				return [
					...rest,
					{ ...first, count: newCount, id: Math.random().toString() },
				];
			});
		}, 2500);
		return () => clearInterval(interval);
	}, []);

	return (
		<div
			className="relative max-h-[180px] overflow-hidden"
			style={{
				maskImage:
					"linear-gradient(to bottom, transparent 0%, black 10%, black 70%, transparent 100%)",
			}}
		>
			<div className="space-y-2">
				<AnimatePresence initial={false} mode="popLayout">
					{events.map((event) => (
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="flex items-center justify-between border border-border/50 bg-secondary/20 p-2 text-xs"
							exit={{ y: -60 }}
							initial={{ opacity: 0, y: 60 }}
							key={event.id}
							layout
							transition={{
								layout: { duration: 0.4, ease: "easeInOut" },
								y: { duration: 0.4, ease: "easeOut" },
							}}
						>
							<div className="flex items-center gap-3">
								<div className="rounded-md border border-border bg-background p-2 text-muted-foreground">
									<CursorClick className="size-3" weight="fill" />
								</div>
								<span className="font-mono text-muted-foreground">
									{event.name}
								</span>
							</div>
							<Badge variant="gray">{event.count}</Badge>
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</div>
	);
};

export default function Bento() {
	return (
		<div className="grid h-full w-full grid-cols-1 gap-4 p-1 md:grid-cols-12">
			{/* Funnels - Large Card */}
			<BentoCard
				className="h-full md:col-span-4 md:row-span-2"
				description="Track user journeys through your app"
				icon={Funnel}
				title="Conversion Funnels"
			>
				<FunnelsFeature />
			</BentoCard>

			{/* Real-time - Medium Card */}
			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				contentClassName="px-0 pb-0"
				description="See who's on your site right now"
				icon={ActivityIcon}
				title="Real-time"
			>
				<RealTimeFeature />
			</BentoCard>

			{/* Sessions - Medium Card */}
			<BentoCard
				className="h-full md:col-span-4 md:row-span-2"
				description="Watch real user sessions"
				icon={Users}
				title="Live Sessions"
			>
				<SessionsFeature />
			</BentoCard>

			{/* Web Vitals - Small Card */}
			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				contentClassName="pb-0"
				description="Monitor core performance metrics"
				icon={Gauge}
				title="Web Vitals"
			>
				<WebVitalsFeature />
			</BentoCard>

			{/* Error Tracking - Medium Card */}
			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				contentClassName="pb-0"
				description="Catch and fix bugs fast"
				icon={Bug}
				title="Error Tracking"
			>
				<ErrorTrackingFeature />
			</BentoCard>

			{/* Feature Flags - Small Card */}
			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				description="Roll out features safely"
				icon={Flag}
				title="Feature Flags"
			>
				<FeatureFlagsFeature />
			</BentoCard>

			{/* Custom Events - Small Card */}
			<BentoCard
				className="h-full md:col-span-4 md:row-span-1"
				description="Track what matters to you"
				icon={CursorClick}
				title="Events"
			>
				<CustomEventsFeature />
			</BentoCard>
		</div>
	);
}
