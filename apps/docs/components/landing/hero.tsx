"use client";

import { cn } from "@/lib/utils";
import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
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

type FullscreenElement = HTMLIFrameElement & {
	webkitRequestFullscreen?: () => Promise<void>;
	mozRequestFullScreen?: () => Promise<void>;
	msRequestFullscreen?: () => Promise<void>;
};

export default function Hero({
	demoEmbedBaseUrl,
}: {
	demoEmbedBaseUrl: string;
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

	const activeIndex = tabs.findIndex((t) => t.id === activeTab);

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
		<section className="relative mx-auto flex w-full max-w-500 flex-col items-center">
			<BackgroundFlow />
			<div className="mx-auto w-full max-w-400 px-4 pt-26 pb-8 sm:px-14 sm:pt-20 lg:px-20 lg:pt-38">
				<div className="mx-auto flex max-w-360 flex-col items-start space-y-2 text-left">
					<h1 className="z-10 font-semibold text-3xl sm:text-5xl md:text-6xl">
						Stop reading dashboards.
						<br />
						<span className="text-muted-foreground">
							Start asking questions.
						</span>
					</h1>

					<p className="z-10 max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
						Ask questions in plain English. Get charts, reports, and actionable
						insights - not more tabs to stare at. Privacy-first, under 30 KB, no
						cookies.
					</p>

					<div className="flex items-center gap-3 pt-2">
						<SciFiButton asChild className="px-6 py-5">
							<a href="https://app.databuddy.cc/login">
								See your analytics in 5 minutes
							</a>
						</SciFiButton>

						<SciFiButton asChild className="px-6 py-5">
							<Link href="/demo">Live demo</Link>
						</SciFiButton>
					</div>
				</div>

				<div className="z-10 mt-5 space-y-0">
					<div className="flex justify-center">
						<div className="relative flex items-center gap-0 rounded-t-lg border-border border-b bg-background">
							{tabs.map((tab) => {
								const isActive = activeTab === tab.id;
								return (
									<button
										className={cn(
											"relative cursor-pointer px-4 py-3 font-medium text-sm transition-colors duration-200 sm:px-6 sm:py-3.5 sm:text-base",
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
												transition={{ type: "spring", stiffness: 500, damping: 35 }}
											/>
										) : null}
									</button>
								);
							})}
						</div>
					</div>

					<div className="relative">
						<a
							className="group/bunny absolute right-0 bottom-full z-30 mb-0 hidden w-40 max-w-[min(100%,10rem)] md:right-0 lg:right-20 lg:block"
							href="https://app.databuddy.cc/login"
						>
							<Image
								alt="Databunny"
								className="transition-transform duration-300 group-hover/bunny:scale-110"
								height={160}
								src="/brand/bunny/off-black.svg"
								width={160}
							/>
							<span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 scale-0 whitespace-nowrap rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground shadow-lg transition-all duration-200 group-hover/bunny:scale-100">
								hey, ask me anything :)
							</span>
						</a>
						<div className="group relative rounded-sm border border-border/50 bg-card p-1.5 shadow-2xl backdrop-blur-sm sm:p-2">
							<div className="relative min-h-[400px] overflow-hidden rounded bg-muted sm:min-h-[500px] lg:min-h-[600px]">
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
									<ArrowsOutSimpleIcon className="size-4" weight="fill" />
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
