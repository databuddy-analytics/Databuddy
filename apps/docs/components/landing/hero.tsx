"use client";

import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import Image from "next/image";
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
		<section className="relative flex w-full flex-col items-center overflow-visible">
			{/*
				Absolute (not fixed): only fills this hero; scrolls away with the section.
				Negative top pulls into the nav spacer so color can read behind the transparent navbar.
				Do not put z-index on this <section> — it can break stacking vs the gradient.
			*/}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-[calc(-4rem-env(safe-area-inset-top,0px))] bottom-0 z-0 w-full sm:left-1/2 sm:w-[min(132vw,2400px)] sm:max-w-none sm:-translate-x-1/2 lg:inset-x-0 lg:w-full lg:translate-x-0"
			>
				<Gradient />
			</div>

			<div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-28 pb-6 sm:px-6 sm:pt-32 lg:px-8 lg:pt-36">
				<div className="flex flex-col items-start space-y-5 sm:space-y-6">
					<h1 className="text-balance font-bold text-5xl leading-[1.1] tracking-tight sm:text-6xl md:text-7xl lg:text-7xl">
						Analytics that runs itself
					</h1>

					<p className="max-w-3xl text-pretty font-normal text-base text-foreground leading-relaxed sm:text-base lg:text-lg">
						Databuddy gives developers a single script to track web analytics,
						catch errors, and ship features.{" "}
					</p>

					<div className="flex items-center gap-3">
						<Button asChild className="px-6 py-5 text-base sm:px-8">
							<Link href="https://app.databuddy.cc/login">Start Free</Link>
						</Button>
						<Button
							asChild
							className="px-6 py-5 text-base sm:px-8"
							variant="secondary"
						>
							<Link href="/demo">Live Demo</Link>
						</Button>
					</div>
				</div>

				<div className="mt-8 w-full sm:mt-10">
					<div className="group relative overflow-visible">
						<div
							aria-hidden
							className="pointer-events-none absolute bottom-full z-30 translate-y-8.5 sm:right-2 sm:translate-y-11 md:right-8 md:translate-y-11"
						>
							<Image
								alt=""
								className="h-22 w-auto select-none drop-shadow-sm sm:h-26 lg:h-30"
								height={220}
								priority={false}
								src="/brand/bunny/off-black.svg"
								unoptimized
								width={220}
							/>
						</div>
						<div className="flex justify-center overflow-x-auto">
							<div
								className="inline-flex max-w-full items-end rounded-t border border-border/50 bg-muted backdrop-blur-sm"
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
				</div>
			</div>
		</section>
	);
}
