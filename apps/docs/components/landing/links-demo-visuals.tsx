"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const LINKS_DATA = [
	{ slug: "/launch", clicks: 2847, country: "us", ref: "twitter" },
	{ slug: "/pricing", clicks: 1203, country: "de", ref: "linkedin" },
	{ slug: "/demo", clicks: 956, country: "jp", ref: "newsletter" },
	{ slug: "/app", clicks: 412, country: "gb", ref: "direct" },
	{ slug: "/changes", clicks: 289, country: "fr", ref: "twitter" },
	{ slug: "/docs", clicks: 178, country: "br", ref: "github" },
	{ slug: "/signup", clicks: 1540, country: "in", ref: "google" },
	{ slug: "/blog", clicks: 634, country: "ca", ref: "rss" },
];

const VISIBLE_LINKS = 5;

export function LinksTableDemo() {
	const [offset, setOffset] = useState(0);

	useEffect(() => {
		if (LINKS_DATA.length <= VISIBLE_LINKS) return;
		const id = setInterval(
			() => setOffset((o) => (o + 1) % LINKS_DATA.length),
			3000,
		);
		return () => clearInterval(id);
	}, []);

	const links: typeof LINKS_DATA = [];
	for (let i = 0; i < VISIBLE_LINKS; i++) {
		links.push(LINKS_DATA[(offset + i) % LINKS_DATA.length]);
	}

	return (
		<div className="space-y-0">
			<div className="mb-3 flex items-center justify-between">
				<div className="space-y-0.5">
					<div className="font-medium font-mono text-2xl text-foreground tabular-nums tracking-tighter">
						6,847
					</div>
					<div className="font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Total Clicks
					</div>
				</div>
				<span className="rounded bg-green-500/10 px-2 py-0.5 font-mono text-green-400 text-xs">
					+12.4%
				</span>
			</div>
			<div className="space-y-1">
				{links.map((link, i) => (
					<div
						className="flex items-center gap-3 rounded border border-border/30 bg-card/50 px-3 py-2 transition-opacity duration-500"
						key={`slot-${String(i)}`}
					>
						<img
							alt={link.country}
							className="h-3 w-5 shrink-0 rounded-[2px] object-cover"
							src={`https://flagcdn.com/40x30/${link.country}.png`}
						/>
						<div className="min-w-0 flex-1">
							<span className="font-mono text-foreground text-xs">
								dby.sh{link.slug}
							</span>
						</div>
						<span className="font-mono text-muted-foreground text-[10px] uppercase">
							{link.ref}
						</span>
						<span className="w-12 text-right font-mono text-foreground text-xs tabular-nums">
							{link.clicks.toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

const REFERRERS = [
	{ source: "X / Twitter", clicks: 1247, pct: 44, color: "bg-blue-400" },
	{ source: "LinkedIn", clicks: 682, pct: 24, color: "bg-purple-400" },
	{ source: "Newsletter", clicks: 512, pct: 18, color: "bg-amber-400" },
	{ source: "Direct", clicks: 406, pct: 14, color: "bg-muted-foreground" },
];

export function ReferrerBreakdownDemo() {
	const [animated, setAnimated] = useState(false);

	useEffect(() => {
		const id = setTimeout(() => setAnimated(true), 300);
		return () => clearTimeout(id);
	}, []);

	return (
		<div className="space-y-0">
			<div className="mb-4 space-y-0.5">
				<div className="font-medium font-mono text-2xl text-foreground tabular-nums tracking-tighter">
					2,847
				</div>
				<div className="font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
					Clicks by Source
				</div>
			</div>

			<div className="mb-4 flex h-2 w-full overflow-hidden rounded-full">
				{REFERRERS.map((ref) => (
					<div
						className={cn("h-full transition-all duration-700 ease-out", ref.color)}
						key={ref.source}
						style={{ width: animated ? `${String(ref.pct)}%` : "0%" }}
					/>
				))}
			</div>

			<div className="space-y-2">
				{REFERRERS.map((ref) => (
					<div className="flex items-center gap-3" key={ref.source}>
						<div className={cn("size-2 shrink-0 rounded-full", ref.color)} />
						<span className="flex-1 font-mono text-foreground text-xs">
							{ref.source}
						</span>
						<span className="font-mono text-muted-foreground text-xs tabular-nums">
							{ref.clicks.toLocaleString()}
						</span>
						<span className="w-8 text-right font-mono text-muted-foreground text-[10px] tabular-nums">
							{ref.pct}%
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

const FUNNEL_STEPS = [
	{ label: "Link Clicked", count: 2847, pct: 100 },
	{ label: "Page Viewed", count: 2103, pct: 73.8 },
	{ label: "Signed Up", count: 412, pct: 14.5 },
	{ label: "Converted", count: 89, pct: 3.1 },
];

export function LinkFunnelDemo() {
	const [animated, setAnimated] = useState(false);

	useEffect(() => {
		const id = setTimeout(() => setAnimated(true), 300);
		return () => clearTimeout(id);
	}, []);

	return (
		<div className="space-y-0">
			<div className="mb-4 flex items-center justify-between">
				<div className="space-y-0.5">
					<div className="font-medium font-mono text-2xl text-foreground tabular-nums tracking-tighter">
						3.1%
					</div>
					<div className="font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Link to Conversion
					</div>
				</div>
				<span className="rounded bg-green-500/10 px-2 py-0.5 font-mono text-green-400 text-xs">
					+0.8%
				</span>
			</div>
			<div className="space-y-2">
				{FUNNEL_STEPS.map((step, i) => (
					<div className="space-y-1" key={step.label}>
						<div className="flex items-center justify-between">
							<span className="font-mono text-foreground text-xs">
								{step.label}
							</span>
							<span className="font-mono text-muted-foreground text-[10px] tabular-nums">
								{step.count.toLocaleString()} ({step.pct}%)
							</span>
						</div>
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-border/30">
							<div
								className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
								style={{
									width: animated ? `${String(step.pct)}%` : "0%",
									opacity: 1 - i * 0.15,
									transitionDelay: `${String(i * 150)}ms`,
								}}
							/>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

const UTM_TAGS = [
	{ key: "source", value: "twitter", color: "bg-blue-500/20 text-blue-400" },
	{ key: "medium", value: "social", color: "bg-purple-500/20 text-purple-400" },
	{ key: "campaign", value: "launch-2026", color: "bg-amber-500/20 text-amber-400" },
];

export function UtmBuilderDemo() {
	const [activeIdx, setActiveIdx] = useState(0);

	useEffect(() => {
		const id = setInterval(
			() => setActiveIdx((i) => (i + 1) % UTM_TAGS.length),
			2000,
		);
		return () => clearInterval(id);
	}, []);

	const params = UTM_TAGS.slice(0, activeIdx + 1)
		.map((t) => `utm_${t.key}=${t.value}`)
		.join("&");

	return (
		<div className="space-y-4">
			<div className="space-y-1.5">
				{UTM_TAGS.map((tag, i) => (
					<motion.div
						animate={{ opacity: i <= activeIdx ? 1 : 0.3 }}
						className="flex items-center gap-2 rounded border border-border/30 bg-card/50 px-3 py-2"
						key={tag.key}
						transition={{ duration: 0.3 }}
					>
						<span className="w-16 font-mono text-muted-foreground text-[10px] uppercase tracking-widest">
							{tag.key}
						</span>
						<span className={cn("rounded px-2 py-0.5 font-mono text-xs", tag.color)}>
							{tag.value}
						</span>
					</motion.div>
				))}
			</div>
			<div className="rounded border border-border/30 bg-muted/20 px-3 py-2">
				<div className="font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
					Result
				</div>
				<div className="mt-1 break-all font-mono text-foreground text-xs">
					dby.sh/pricing<span className="text-muted-foreground">?{params}</span>
				</div>
			</div>
		</div>
	);
}

const DEEP_LINKS = [
	{
		app: "Instagram",
		color: "#E4405F",
		url: "instagram.com/databuddy",
		resolved: "instagram://user?username=databuddy",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/instagram.svg",
	},
	{
		app: "YouTube",
		color: "#FF0000",
		url: "youtube.com/watch?v=abc123",
		resolved: "vnd.youtube://abc123",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/youtube.svg",
	},
	{
		app: "Spotify",
		color: "#1DB954",
		url: "open.spotify.com/track/xyz",
		resolved: "spotify://track/xyz",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/spotify.svg",
	},
	{
		app: "X",
		color: "#fff",
		url: "x.com/trydatabuddy",
		resolved: "twitter://user?screen_name=trydatabuddy",
		icon: "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/x.svg",
	},
];

export function DeepLinkDemo() {
	const [activeIdx, setActiveIdx] = useState(0);

	useEffect(() => {
		const id = setInterval(
			() => setActiveIdx((i) => (i + 1) % DEEP_LINKS.length),
			2500,
		);
		return () => clearInterval(id);
	}, []);

	const active = DEEP_LINKS[activeIdx];

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				{DEEP_LINKS.map((dl, i) => (
					<button
						className={cn(
							"flex size-8 items-center justify-center rounded-lg border transition-all duration-300",
							i === activeIdx
								? "border-border bg-card"
								: "border-transparent opacity-40",
						)}
						key={dl.app}
						onClick={() => setActiveIdx(i)}
						type="button"
					>
						<img
							alt={dl.app}
							className="size-4 invert"
							src={dl.icon}
						/>
					</button>
				))}
			</div>

			<div className="space-y-2 rounded border border-border/30 bg-card/50 p-3">
				<div className="flex items-center justify-between">
					<span className="font-medium font-mono text-foreground text-xs">
						{active.app}
					</span>
					<span
						className="size-2 rounded-full"
						style={{ backgroundColor: active.color }}
					/>
				</div>
				<div>
					<div className="font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Input
					</div>
					<div className="font-mono text-foreground text-xs">
						{active.url}
					</div>
				</div>
				<div className="border-border/30 border-t pt-2">
					<div className="font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Opens as
					</div>
					<div className="font-mono text-primary text-xs">
						{active.resolved}
					</div>
				</div>
			</div>

			<p className="text-muted-foreground text-xs">
				Paste any link from a supported app. Databuddy resolves it to a native
				URI so mobile users land in the app, not a browser tab.
			</p>
		</div>
	);
}
