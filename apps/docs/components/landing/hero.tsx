"use client";

import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	ArrowsOutSimpleIcon,
	BugIcon,
	CaretDownIcon,
	FlagIcon,
	FunnelIcon,
	GaugeIcon,
	LightbulbFilamentIcon,
	LightningIcon,
	TrendUpIcon,
} from "@databuddy/ui/icons";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BackgroundFlow from "./backgroundFlow";
import { SciFiButton } from "./scifi-btn";

const tabs = [
	{ id: "overview", label: "Overview", path: "" },
	{ id: "events", label: "Events", path: "/events" },
	{ id: "errors", label: "Errors", path: "/errors" },
	{ id: "vitals", label: "Vitals", path: "/vitals" },
	{ id: "funnels", label: "Funnels", path: "/funnels" },
	{ id: "flags", label: "Flags", path: "/flags" },
] as const;

const allTabIds = new Set(tabs.map((t) => t.id));

type HeroInsightTone = "positive" | "negative" | "warning";
type HeroTabId = (typeof tabs)[number]["id"];
type HeroInsightIcon = typeof TrendUpIcon;

const insightToneClass: Record<
	HeroInsightTone,
	{ bg: string; text: string; chip: string }
> = {
	positive: {
		bg: "bg-emerald-500/10",
		text: "text-emerald-500",
		chip: "bg-emerald-500/10 text-emerald-500",
	},
	negative: {
		bg: "bg-red-500/10",
		text: "text-red-500",
		chip: "bg-red-500/10 text-red-500",
	},
	warning: {
		bg: "bg-amber-500/10",
		text: "text-amber-500",
		chip: "bg-amber-500/10 text-amber-500",
	},
};

const heroInsights = [
	{
		tabId: "overview",
		icon: TrendUpIcon,
		headline: "Pricing traffic is converting 3x above baseline",
		meta: "databuddy.cc - now",
		change: "+340%",
		tone: "positive",
		whyItMatters:
			"Launch referral traffic is landing on /pricing and signing up at 12.4%.",
		nextStep: "Send this cohort to the founder-led onboarding path.",
		evidence: ["8.4k sessions", "12.4% signup", "/pricing"],
	},
	{
		tabId: "events",
		icon: LightningIcon,
		headline: "Invite accepted events jumped after the docs CTA shipped",
		meta: "app.databuddy.cc - 12m ago",
		change: "+64%",
		tone: "positive",
		whyItMatters:
			"Visitors from the SDK guide are creating teams faster than the site baseline.",
		nextStep: "Keep the docs CTA and test the same prompt on the pricing page.",
		evidence: ["1.9k events", "+64% WoW", "sdk_guide"],
	},
	{
		tabId: "errors",
		icon: BugIcon,
		headline: "Checkout errors are concentrated on mobile Safari",
		meta: "app.databuddy.cc - 6m ago",
		change: "+180%",
		tone: "negative",
		whyItMatters:
			"The last deploy increased step-two exceptions for iOS visitors.",
		nextStep: "Roll back address autocomplete and watch drop-off recover.",
		evidence: ["847 errors", "+23% drop-off", "iOS Safari"],
	},
	{
		tabId: "vitals",
		icon: GaugeIcon,
		headline: "INP degraded on the signup flow after script growth",
		meta: "app.databuddy.cc - 24m ago",
		change: "+42%",
		tone: "warning",
		whyItMatters:
			"Interaction latency is highest on the plan selector, where new users decide.",
		nextStep: "Defer the pricing calculator bundle and recheck p75 INP.",
		evidence: ["284ms p75", "+42%", "/signup"],
	},
	{
		tabId: "funnels",
		icon: FunnelIcon,
		headline: "Signup funnel is leaking at email verification",
		meta: "app.databuddy.cc - 38m ago",
		change: "-18%",
		tone: "warning",
		whyItMatters:
			"Mobile visitors reach signup, then leave at email verification.",
		nextStep:
			"Restore the shorter verification copy for mobile visitors first.",
		evidence: ["234 trials", "-31% mobile", "verify step"],
	},
	{
		tabId: "flags",
		icon: FlagIcon,
		headline: "New onboarding variant is lifting activation",
		meta: "app.databuddy.cc - 1h ago",
		change: "+21%",
		tone: "positive",
		whyItMatters:
			"The 20% rollout is creating more completed projects without raising errors.",
		nextStep: "Roll out to 50% and watch activation plus support events.",
		evidence: ["20% rollout", "+21% activation", "0 error lift"],
	},
] satisfies {
	change: string;
	evidence: string[];
	headline: string;
	icon: HeroInsightIcon;
	meta: string;
	nextStep: string;
	tabId: HeroTabId;
	tone: HeroInsightTone;
	whyItMatters: string;
}[];

const heroInsightByTab = new Map<HeroTabId, (typeof heroInsights)[number]>(
	heroInsights.map((insight) => [insight.tabId, insight])
);

const tabLabels = new Map<HeroTabId, string>(
	tabs.map((tab) => [tab.id, tab.label])
);

type FullscreenElement = HTMLIFrameElement & {
	webkitRequestFullscreen?: () => Promise<void>;
	mozRequestFullScreen?: () => Promise<void>;
	msRequestFullscreen?: () => Promise<void>;
};

function HeroInsightOverlay({ activeTab }: { activeTab: HeroTabId }) {
	const insight = heroInsightByTab.get(activeTab) ?? heroInsights[0];
	const Icon = insight.icon;
	const tone = insightToneClass[insight.tone];
	const sourceLabel = tabLabels.get(activeTab) ?? "Overview";

	return (
		<div className="pointer-events-none absolute top-3 right-3 left-3 z-30 md:top-5 md:right-5 md:left-auto md:w-[26rem]">
			<motion.div
				animate={{ opacity: 0, scale: 1.08 }}
				aria-hidden
				className={cn(
					"absolute -inset-1 rounded border",
					tone.text,
					"border-current/40"
				)}
				initial={{ opacity: 0.8, scale: 0.98 }}
				key={`${insight.tabId}-pulse`}
				transition={{ duration: 0.9, ease: "easeOut" }}
			/>
			<motion.div
				animate={{ opacity: 1, scale: 1, y: 0 }}
				className="overflow-hidden rounded border bg-background/95 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur"
				initial={{ opacity: 0, scale: 0.98, y: 8 }}
				key={insight.tabId}
				transition={{ duration: 0.3, ease: "easeOut" }}
			>
				<div className="flex items-start gap-3 px-3 py-3 md:px-4">
					<span
						className={cn(
							"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded",
							tone.bg,
							tone.text
						)}
					>
						<Icon className="size-4" weight="duotone" />
					</span>
					<div className="min-w-0 flex-1">
						<div className="flex items-start justify-between gap-2">
							<p className="line-clamp-2 font-medium text-foreground text-sm leading-snug">
								{insight.headline}
							</p>
							<CaretDownIcon
								className="mt-0.5 size-3 shrink-0 rotate-180 text-muted-foreground"
								weight="fill"
							/>
						</div>
						<div className="mt-0.5 flex items-center gap-1.5 text-xs">
							<span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
								From {sourceLabel}
							</span>
							<span className="truncate text-muted-foreground">
								{insight.meta}
							</span>
							<span className="text-muted-foreground/30">&middot;</span>
							<span className={cn("tabular-nums", tone.text)}>
								{insight.change}
							</span>
						</div>
						<motion.div
							animate={{ opacity: 1, y: 0 }}
							className="mt-2 space-y-1"
							initial={{ opacity: 0, y: 4 }}
							transition={{ delay: 0.12, duration: 0.22, ease: "easeOut" }}
						>
							<p className="hidden font-medium text-[10px] text-muted-foreground uppercase md:block">
								Why it matters
							</p>
							<p className="line-clamp-1 text-muted-foreground text-xs leading-relaxed md:line-clamp-2">
								{insight.whyItMatters}
							</p>
						</motion.div>
					</div>
				</div>

				<div className="hidden border-border/60 border-t px-4 pt-3 pb-3 md:block">
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="flex items-start gap-2 rounded border border-border/60 bg-accent/40 p-2.5"
						initial={{ opacity: 0, y: 5 }}
						transition={{ delay: 0.22, duration: 0.22, ease: "easeOut" }}
					>
						<LightbulbFilamentIcon
							className="mt-0.5 size-4 shrink-0 text-amber-500"
							weight="duotone"
						/>
						<div className="min-w-0">
							<p className="font-medium text-[11px] text-foreground uppercase">
								Do this next
							</p>
							<p className="text-foreground/85 text-xs leading-relaxed">
								{insight.nextStep}
							</p>
						</div>
					</motion.div>
				</div>

				<div className="flex items-center justify-between gap-2 border-border/60 border-t px-3 py-2 md:px-4">
					<div className="flex min-w-0 flex-wrap gap-1.5">
						{insight.evidence.map((item, index) => (
							<motion.span
								animate={{ opacity: 1, y: 0 }}
								className={cn(
									"rounded-full border border-border/60 bg-background px-2 py-1 text-[10px] text-muted-foreground",
									index === 2 && "hidden sm:inline-flex"
								)}
								initial={{ opacity: 0, y: 4 }}
								key={item}
								transition={{
									delay: 0.28 + index * 0.06,
									duration: 0.18,
									ease: "easeOut",
								}}
							>
								{item}
							</motion.span>
						))}
					</div>
					<motion.div
						animate={{ opacity: 1, x: 0 }}
						className="hidden shrink-0 md:block"
						initial={{ opacity: 0, x: 6 }}
						transition={{ delay: 0.46, duration: 0.2, ease: "easeOut" }}
					>
						<Link
							className={cn(
								"pointer-events-auto inline-flex items-center rounded px-2 py-1 text-[10px] transition-opacity hover:opacity-80",
								tone.chip
							)}
							href="/databunny"
						>
							Ask agent
							<ArrowRightIcon className="ml-1 size-3" weight="fill" />
						</Link>
					</motion.div>
				</div>
			</motion.div>
		</div>
	);
}

export default function Hero({
	demoEmbedBaseUrl,
}: {
	demoEmbedBaseUrl: string;
}) {
	const [activeTab, setActiveTab] = useState<HeroTabId>(tabs[0].id);
	const [loadedTabIds, setLoadedTabIds] = useState<Set<string>>(
		() => new Set([tabs[0].id])
	);
	const [embedReady, setEmbedReady] = useState<Set<string>>(() => new Set());
	const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

	useEffect(() => {
		const run = () => setLoadedTabIds(new Set(allTabIds));
		if (typeof requestIdleCallback !== "undefined") {
			const id = requestIdleCallback(run);
			return () => cancelIdleCallback(id);
		}
		const id = window.setTimeout(run, 300);
		return () => clearTimeout(id);
	}, []);

	const activeIndex = tabs.findIndex((t) => t.id === activeTab);

	const selectTab = (id: HeroTabId) => {
		setActiveTab(id);
		setLoadedTabIds((prev) => new Set(prev).add(id));
	};

	const markEmbedReady = (tabId: string) => {
		setEmbedReady((prev) => new Set(prev).add(tabId));
	};

	const handleFullscreen = async () => {
		const element = iframeRefs.current[activeTab] as FullscreenElement | null;
		if (!element) {
			return;
		}

		try {
			if (element.requestFullscreen) {
				await element.requestFullscreen();
			} else if (element.webkitRequestFullscreen) {
				await element.webkitRequestFullscreen();
			} else if (element.mozRequestFullScreen) {
				await element.mozRequestFullScreen();
			} else if (element.msRequestFullscreen) {
				await element.msRequestFullscreen();
			} else {
				window.open(element.src, "_blank", "noopener,noreferrer");
			}
		} catch {
			window.open(element.src, "_blank", "noopener,noreferrer");
		}
	};

	return (
		<section className="relative mx-auto flex w-full max-w-500 flex-col items-center">
			<BackgroundFlow />
			<div className="mx-auto w-full max-w-400 px-4 pt-26 pb-8 sm:px-14 sm:pt-20 lg:px-20 lg:pt-38">
				<div className="mx-auto flex max-w-360 flex-col items-start space-y-2 text-left">
					<h1 className="z-10 font-semibold text-3xl sm:text-5xl md:text-6xl">
						See what changed
						<br />
						<span className="text-muted-foreground">and what to do next.</span>
					</h1>

					<p className="z-10 max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
						Databuddy tracks visits, events, errors, funnels, and rollouts, then
						surfaces the important answers as insight cards with evidence and a
						next step attached.
					</p>

					<div className="flex flex-wrap items-center gap-3 pt-2">
						<SciFiButton asChild className="px-6 py-5">
							<a href="https://app.databuddy.cc/register">
								See answers surfaced
							</a>
						</SciFiButton>

						<SciFiButton asChild className="px-6 py-5">
							<Link href="/demo">Live demo</Link>
						</SciFiButton>
					</div>

					<p className="z-10 text-muted-foreground/50 text-xs">
						Free up to 10,000 events/mo. No credit card required.
					</p>
				</div>

				<div className="z-10 mt-5 space-y-0">
					<div className="flex justify-center overflow-x-auto">
						<div className="relative flex items-center gap-0 rounded-t-lg border-border border-b bg-background">
							{tabs.map((tab) => {
								const isActive = activeTab === tab.id;
								return (
									<button
										className={cn(
											"relative cursor-pointer whitespace-nowrap px-2.5 py-2.5 font-medium text-xs transition-colors duration-200 sm:px-6 sm:py-3.5 sm:text-base",
											isActive
												? "text-foreground"
												: "text-muted-foreground hover:text-foreground"
										)}
										key={tab.id}
										onClick={() => selectTab(tab.id)}
										type="button"
									>
										{tab.label}
										{isActive ? (
											<motion.div
												className="absolute right-0 bottom-0 left-0 h-0.5 bg-foreground"
												layoutId="hero-tab-indicator"
												transition={{
													type: "spring",
													stiffness: 500,
													damping: 35,
												}}
											/>
										) : null}
									</button>
								);
							})}
						</div>
					</div>

					<div className="relative">
						<HeroInsightOverlay activeTab={activeTab} />
						<Link
							className="group/bunny absolute right-0 bottom-full z-20 mb-0 hidden w-40 max-w-[min(100%,10rem)] md:right-0 lg:right-20 lg:block"
							href="/databunny"
						>
							<Image
								alt="Databunny"
								className="transition-transform duration-300 group-hover/bunny:scale-110"
								height={160}
								src="/brand/bunny/off-black.svg"
								width={160}
							/>
							<span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 scale-0 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-foreground text-xs shadow-lg transition-all duration-200 group-hover/bunny:scale-100">
								ask Databunny
							</span>
						</Link>
						<div className="group relative rounded-sm border border-border/50 bg-card p-1.5 shadow-2xl backdrop-blur-sm sm:p-2">
							<div className="relative min-h-[400px] overflow-x-hidden rounded bg-muted sm:min-h-[500px] lg:min-h-[600px]">
								{tabs.map((tab, i) => {
									const isActive = activeTab === tab.id;
									const translateX = isActive
										? "0%"
										: i > activeIndex
											? "100%"
											: "-100%";
									const src = loadedTabIds.has(tab.id)
										? `${demoEmbedBaseUrl}${tab.path}?embed=true`
										: "about:blank";
									return (
										<iframe
											allowFullScreen
											aria-hidden={!isActive}
											className={cn(
												"absolute inset-0 h-[400px] w-full rounded border-0 bg-muted shadow-inner transition-[transform,opacity] duration-300 ease-out sm:h-[500px] lg:h-[600px]",
												isActive
													? "z-10 opacity-100"
													: "pointer-events-none z-0 opacity-0"
											)}
											key={tab.id}
											onLoad={(e) => {
												const url = e.currentTarget.src;
												if (url.includes("embed=true")) {
													markEmbedReady(tab.id);
												}
											}}
											ref={(el) => {
												iframeRefs.current[tab.id] = el;
											}}
											src={src}
											style={{ transform: `translateX(${translateX})` }}
											tabIndex={isActive ? 0 : -1}
											title={`Databuddy ${tab.label} Demo`}
										/>
									);
								})}
								<div
									aria-hidden
									className={cn(
										"pointer-events-none absolute inset-0 z-20 rounded bg-muted transition-opacity duration-200",
										loadedTabIds.has(activeTab) && !embedReady.has(activeTab)
											? "opacity-100"
											: "opacity-0"
									)}
								/>
							</div>

							<button
								aria-label="Open demo in fullscreen"
								className="absolute inset-1.5 flex items-center justify-center rounded bg-background/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:inset-2"
								onClick={handleFullscreen}
								type="button"
							>
								<div className="flex cursor-pointer items-center gap-2 rounded border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm transition-colors duration-200 hover:bg-card">
									<ArrowsOutSimpleIcon className="size-4" />
									<span>Click to view fullscreen</span>
								</div>
							</button>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
