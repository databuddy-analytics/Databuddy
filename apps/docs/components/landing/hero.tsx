"use client";

import { Button } from "@databuddy/ui";
import { cn } from "@/lib/utils";
import { ArrowsOutSimpleIcon, CursorClickIcon } from "@databuddy/ui/icons";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { flush, track } from "@databuddy/sdk";
import BackgroundFlow from "./backgroundFlow";
import { IN_OUT } from "./demo-primitives";
import { YcBadge } from "@/components/yc-badge";
import { getDemoEmbedBaseUrl } from "@/lib/demo-embed-url";
import { normalizePlans } from "@/app/(home)/pricing/_pricing/normalize";
import { RAW_PLANS } from "@/app/(home)/pricing/data";

const tabs = [
	{ id: "overview", label: "Overview", path: "" },
	{ id: "events", label: "Events", path: "/events" },
	{ id: "errors", label: "Errors", path: "/errors" },
	{ id: "vitals", label: "Vitals", path: "/vitals" },
	{ id: "funnels", label: "Funnels", path: "/funnels" },
] as const;

type HeroTabId = (typeof tabs)[number]["id"];

const TAB_KEYS: Partial<Record<string, (index: number) => number>> = {
	ArrowRight: (index) => (index + 1) % tabs.length,
	ArrowLeft: (index) => (index - 1 + tabs.length) % tabs.length,
	Home: () => 0,
	End: () => tabs.length - 1,
};

const plans = normalizePlans(RAW_PLANS);
const freeEvents =
	plans.find((plan) => plan.id === "free")?.includedEventsMonthly ?? 10_000;
const startingPrice =
	plans.find((plan) => plan.id === "hobby")?.priceMonthly ?? 9.99;

type FullscreenElement = HTMLIFrameElement & {
	webkitRequestFullscreen?: () => Promise<void>;
	mozRequestFullScreen?: () => Promise<void>;
	msRequestFullscreen?: () => Promise<void>;
};

export default function Hero() {
	const [activeTab, setActiveTab] = useState<HeroTabId>(tabs[0].id);
	const [hoveredTab, setHoveredTab] = useState<HeroTabId | null>(null);
	const [loadedTabIds, setLoadedTabIds] = useState<Set<string>>(
		() => new Set()
	);
	const [embedReady, setEmbedReady] = useState<Set<string>>(() => new Set());
	const [exploring, setExploring] = useState(false);
	const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
	const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

	const activeIndex = tabs.findIndex((t) => t.id === activeTab);
	const activeLoaded = loadedTabIds.has(activeTab);

	useEffect(() => {
		if (window.matchMedia("(min-width: 768px)").matches) {
			setLoadedTabIds((prev) => new Set(prev).add(tabs[0].id));
		}
	}, []);

	const selectTab = (id: HeroTabId) => {
		setActiveTab(id);
		setLoadedTabIds((prev) => new Set(prev).add(id));
	};

	const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
		const next = TAB_KEYS[event.key];
		if (!next) {
			return;
		}
		event.preventDefault();
		const tab = tabs[next(activeIndex)];
		selectTab(tab.id);
		tabRefs.current[tab.id]?.focus();
	};

	const markEmbedReady = (tabId: string) => {
		setEmbedReady((prev) => new Set(prev).add(tabId));
	};

	const startExploring = () => {
		setExploring(true);
		iframeRefs.current[activeTab]?.focus();
		track("hero_demo_explored", { tab: activeTab });
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
					<YcBadge className="z-10 mb-4" />
					<h1 className="z-10 font-semibold text-3xl sm:text-5xl md:text-6xl">
						Product analytics for founders
						<br />
						<span className="text-muted-foreground">without a data team.</span>
					</h1>

					<p className="z-10 max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
						Track visitors, signups, funnels, and revenue in one place. Ask
						Databunny, the built-in AI analyst, about your numbers and see the
						query behind every answer.
					</p>

					<div className="flex flex-wrap items-center gap-3 pt-2">
						<Button asChild size="lg">
							<a
								href="https://app.databuddy.cc/register"
								onClick={() => {
									track("signup_cta_clicked", {
										page: "home",
										placement: "hero",
									});
									flush();
								}}
							>
								Start free
							</a>
						</Button>

						<Button asChild size="lg" variant="secondary">
							<Link
								href="/demo"
								onClick={() => {
									track("demo_opened", { page: "home", placement: "hero" });
									flush();
								}}
							>
								Try the live demo
							</Link>
						</Button>
					</div>

					<p className="z-10 pt-3 text-muted-foreground text-sm">
						Free up to {freeEvents.toLocaleString("en-US")} events a month, then
						from ${startingPrice} a month. No credit card.
					</p>
				</div>

				<div className="z-10 mt-5 space-y-0">
					<div className="flex justify-center overflow-x-auto">
						<div
							aria-label="Dashboard demo"
							className="relative flex items-center rounded-t-lg border-border border-b bg-background px-1"
							onMouseLeave={() => setHoveredTab(null)}
							role="tablist"
						>
							{tabs.map((tab) => {
								const isActive = activeTab === tab.id;
								return (
									<button
										aria-controls="hero-demo-panel"
										aria-selected={isActive}
										className={cn(
											"relative h-10 cursor-pointer whitespace-nowrap px-2.5 font-medium text-xs transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:h-11 sm:px-4 sm:text-sm",
											isActive
												? "text-foreground"
												: "text-muted-foreground hover:text-foreground"
										)}
										id={`hero-tab-${tab.id}`}
										key={tab.id}
										onClick={() => selectTab(tab.id)}
										onFocus={() => setHoveredTab(tab.id)}
										onKeyDown={handleTabKey}
										onMouseEnter={() => setHoveredTab(tab.id)}
										ref={(el) => {
											tabRefs.current[tab.id] = el;
										}}
										role="tab"
										tabIndex={isActive ? 0 : -1}
										type="button"
									>
										{hoveredTab === tab.id ? (
											<motion.span
												aria-hidden
												className="absolute inset-x-0.5 inset-y-1.5 rounded bg-secondary"
												layoutId="hero-tab-hover"
												transition={{ duration: 0.2, ease: IN_OUT }}
											/>
										) : null}
										<span className="relative">{tab.label}</span>
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

					{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: leaving the demo hands scrolling back to the page; the explore button is the control. */}
					<div className="relative" onMouseLeave={() => setExploring(false)}>
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
						<div
							aria-labelledby={`hero-tab-${activeTab}`}
							className={cn(
								"group relative rounded-sm border bg-card p-1.5 shadow-2xl backdrop-blur-sm transition-colors duration-200 ease-in-out sm:p-2",
								exploring ? "border-border" : "border-border/50"
							)}
							id="hero-demo-panel"
							role="tabpanel"
						>
							<div className="relative min-h-[400px] overflow-x-hidden rounded bg-muted sm:min-h-[500px] lg:min-h-[600px]">
								{tabs.map((tab, i) => {
									const isActive = activeTab === tab.id;
									const translateX = isActive
										? "0%"
										: i > activeIndex
											? "100%"
											: "-100%";
									const src = loadedTabIds.has(tab.id)
										? `${getDemoEmbedBaseUrl(window.location.hostname)}${tab.path}?embed=true`
										: "about:blank";
									return (
										<iframe
											allowFullScreen
											aria-hidden={!isActive}
											className={cn(
												"absolute inset-0 h-[400px] w-full rounded border-0 bg-muted shadow-inner transition-[transform,opacity] duration-300 ease-in-out sm:h-[500px] lg:h-[600px]",
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
										activeLoaded && !embedReady.has(activeTab)
											? "opacity-100"
											: "opacity-0"
									)}
								/>
							</div>

							{activeLoaded ? (
								<>
									{exploring ? null : (
										<button
											className="absolute inset-1.5 z-20 flex cursor-pointer items-end justify-center rounded pb-8 sm:inset-2"
											onClick={startExploring}
											type="button"
										>
											<span className="flex items-center gap-2 rounded border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm transition-[opacity,transform] duration-200 ease-in-out md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
												<CursorClickIcon className="size-4" />
												Explore the live demo
											</span>
										</button>
									)}
									<button
										aria-label="Open demo in fullscreen"
										className="absolute top-3 right-3 z-30 flex size-8 cursor-pointer items-center justify-center rounded border border-border bg-card/90 text-muted-foreground shadow-lg backdrop-blur-sm transition-[opacity,color] duration-200 ease-in-out hover:text-foreground focus-visible:opacity-100 sm:top-4 sm:right-4 md:opacity-0 md:group-hover:opacity-100"
										onClick={handleFullscreen}
										type="button"
									>
										<ArrowsOutSimpleIcon className="size-4" />
									</button>
								</>
							) : (
								<button
									className="absolute inset-1.5 z-20 flex items-end justify-center rounded pb-8 md:hidden"
									onClick={() => selectTab(activeTab)}
									type="button"
								>
									<span className="flex items-center gap-2 rounded border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm">
										<ArrowsOutSimpleIcon className="size-4" />
										Load the live demo
									</span>
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
