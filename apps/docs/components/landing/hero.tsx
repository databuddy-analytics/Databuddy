"use client";

import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { motion, type Variants } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Gradient } from "./gradient";

const tabs = [
	{ id: "overview", label: "Overview", path: "" },
	{ id: "events", label: "Events", path: "/events" },
	{ id: "errors", label: "Errors", path: "/errors" },
	{ id: "vitals", label: "Vitals", path: "/vitals" },
	{ id: "funnels", label: "Funnels", path: "/funnels" },
	{ id: "flags", label: "Flags", path: "/flags" },
] as const;

const allTabIds = new Set(tabs.map((t) => t.id));

type FullscreenElement = HTMLIFrameElement & {
	webkitRequestFullscreen?: () => Promise<void>;
	mozRequestFullScreen?: () => Promise<void>;
	msRequestFullscreen?: () => Promise<void>;
};

const container: Variants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.12 } },
};

const item: Variants = {
	hidden: { opacity: 0, y: 20 },
	show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function Hero({
	demoEmbedBaseUrl,
	stars,
}: {
	demoEmbedBaseUrl: string;
	stars?: number | null;
}) {
	const [activeTab, setActiveTab] = useState<string>(tabs[0].id);
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

	const selectTab = (id: string) => {
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
		<section className="relative flex w-full flex-col items-center overflow-hidden">
			{/* <Spotlight transform="translateX(-60%) translateY(-50%)" /> */}
			<Gradient />
			{/* <GridBackground /> */}
			{/* <div className="pointer-events-none absolute top-1/2 right-[-10%] z-0 h-[60%] w-auto -translate-y-1/2">
				<img
					alt=""
					aria-hidden
					className="h-full w-auto select-none"
					src="/brand/bunny/black.svg"
				/>
				<div
					className="absolute inset-0"
					style={{
						background:
							"linear-gradient(to bottom, transparent 50%, var(--background) 100%)",
					}}
				/>
			</div> */}

			<div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-28 pb-6 sm:px-6 sm:pt-32 lg:px-8 lg:pt-36">
				<motion.div
					animate="show"
					className="flex flex-col items-start space-y-5 sm:space-y-6"
					initial="hidden"
					variants={container}
				>
					{/*<motion.div variants={item}>
					<SciFiCard className="inline-block">
						<span className="relative inline-flex items-center gap-2 rounded border border-border bg-foreground/5 px-3 py-1.5 font-medium text-xs uppercase tracking-widest text-muted-foreground backdrop-blur-[50px] shadow-[0px_-82px_68px_-109px_inset_rgba(255,255,255,0.3),0px_98px_100px_-170px_inset_rgba(255,255,255,0.6),0px_4px_18px_-8px_inset_rgba(255,255,255,0.6),0px_1px_40px_-14px_inset_rgba(255,255,255,0.3)]">
							Backed by <YCLogo className="inline-block size-4 align-middle" /> Combinator
						</span>
					</SciFiCard>
					</motion.div>*/}
					<motion.h1
						className="text-balance font-bold text-5xl leading-[1.1] tracking-tight sm:text-6xl md:text-7xl lg:text-7xl"
						variants={item}
					>
						Analytics that runs itself
					</motion.h1>
					{/* <h1 className="text-balance font-bold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
						Privacy-first analytics.{" "}
						<span className="text-muted-foreground">
							One script,{" "}
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										className="cursor-help border-0 bg-transparent p-0 font-inherit text-inherit underline decoration-muted-foreground/70 decoration-dotted underline-offset-[0.15em] hover:decoration-foreground/60"
										type="button"
									>
										no cookies,
									</button>
								</TooltipTrigger>
								<TooltipContent
									className="max-w-72 text-pretty text-left text-xs leading-relaxed sm:max-w-sm"
									side="bottom"
									sideOffset={8}
								>
									<span className="block">
										Cookieless by design. No fingerprints, no consent banner.
										B2B research on 1.2M+ interactions found 68.9% of cookie
										banners closed or ignored.{" "}
										<a
											className="font-medium underline underline-offset-2 hover:text-primary-foreground/90"
											href="https://www.advance-metrics.com/en/blog/cookie-behaviour-study/"
											rel="noopener noreferrer"
											target="_blank"
										>
											Advance Metrics
										</a>
									</span>
								</TooltipContent>
							</Tooltip>
							no consent banners.
						</span>
					</h1> */}

					<motion.p
						className="max-w-3xl text-pretty font-normal text-base text-muted-foreground leading-relaxed sm:text-base lg:text-lg"
						variants={item}
					>
						Databuddy gives developers a single script to track web analytics,
						catch errors, and ship features.{" "}
						{/* <Link
							className="text-foreground"
							href="https://github.com/databuddy-analytics/databuddy"
							rel="noopener noreferrer"
							target="_blank"
						>
							Open source
						</Link>
						{' '}and autonomous. */}
					</motion.p>

					{/* <p className="max-w-2xl text-pretty text-muted-foreground text-xs leading-relaxed sm:text-sm">
						<a
							className="underline underline-offset-2 hover:text-foreground"
							href="https://www.advance-metrics.com/en/blog/cookie-behaviour-study/"
							rel="noopener noreferrer"
							target="_blank"
						>
							Advance Metrics
						</a>{" "}
						on real-world banner behavior.{" "}
						<Link
							className="underline underline-offset-2 hover:text-foreground"
							href="/calculator"
						>
							Model the opportunity cost
						</Link>{" "}
						for your traffic.
					</p> */}

					<motion.div className="flex items-center gap-3" variants={item}>
						<Button asChild className="px-6 py-5 text-base sm:px-8">
							<Link href="https://app.databuddy.cc/login">Start Free</Link>
						</Button>
						{/* <a
							className="flex items-center gap-2 leading-none"
							href="https://github.com/databuddy-analytics/Databuddy"
							rel="noopener noreferrer"
							target="_blank"
						>
							<GithubNavMark className="text-xl transition-transform duration-200 hover:scale-110" />
							{typeof stars === "number" && (
								<span className="translate-y-px">
									{stars.toLocaleString()} ★
								</span>
							)}
						</a> */}
						<Button
							asChild
							className="px-6 py-5 text-base sm:px-8"
							variant="secondary"
						>
							<Link href="/demo">Live Demo</Link>
						</Button>
					</motion.div>

					{/* <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
						<span>Used by 400+ teams</span>
						<span className="text-border">·</span>
						{stars ? (
							<>
								<span>{formatLocaleNumber(stars)} GitHub stars</span>
								<span className="text-border">·</span>
							</>
						) : null}
						<span>Open source</span>
					</p> */}
				</motion.div>

				<motion.div
					animate="show"
					className="mt-8 w-full sm:mt-10"
					initial="hidden"
					transition={{ delay: 0.45, duration: 0.55, ease: "easeOut" }}
					variants={item}
				>
					<div className="group relative overflow-hidden">
						<div className="flex justify-center overflow-x-auto">
							<div
								className="inline-flex max-w-full items-end rounded border border-border/50 bg-muted backdrop-blur-sm"
								role="tablist"
							>
								{tabs.map((tab) => {
									const isActive = activeTab === tab.id;
									return (
										<button
											aria-selected={isActive}
											className={cn(
												"relative shrink-0 cursor-pointer px-3 py-2 font-medium text-xs transition-colors duration-200 sm:px-4 sm:py-2.5 sm:text-sm",
												isActive
													? "text-foreground"
													: "text-muted-foreground hover:text-foreground"
											)}
											key={tab.id}
											onClick={() => selectTab(tab.id)}
											role="tab"
											type="button"
										>
											{tab.label}
											{isActive ? (
												<div className="absolute right-2 bottom-0 left-2 h-px rounded bg-foreground sm:right-3 sm:left-3" />
											) : null}
										</button>
									);
								})}
							</div>
						</div>

						<div className="relative px-1.5 pt-0 pb-1.5 sm:px-2 sm:pb-2">
							<div className="relative min-h-[360px] overflow-hidden rounded bg-muted sm:min-h-[460px] lg:min-h-[540px]">
								{tabs.map((tab) => {
									const isActive = activeTab === tab.id;
									const src = loadedTabIds.has(tab.id)
										? `${demoEmbedBaseUrl}${tab.path}?embed=true`
										: "about:blank";
									return (
										<iframe
											allowFullScreen
											aria-hidden={!isActive}
											className={cn(
												"h-[360px] w-full rounded border-0 bg-muted shadow-inner sm:h-[460px] lg:h-[540px]",
												isActive
													? "relative z-10"
													: "pointer-events-none absolute inset-0 z-0 opacity-0"
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
									<ArrowsOutSimpleIcon className="size-4" weight="fill" />
									<span>Click to view fullscreen</span>
								</div>
							</button>
						</div>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
