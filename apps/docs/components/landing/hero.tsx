"use client";

import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatLocaleNumber } from "@/lib/format-locale-number";
import { cn } from "@/lib/utils";
import { SciFiButton } from "./scifi-btn";
import { Spotlight } from "./spotlight";

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
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
				<div className="mx-auto flex max-w-4xl flex-col items-center space-y-8 text-center">
					<h1 className="text-balance font-bold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
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
					</h1>

					<p className="max-w-2xl text-pretty font-medium text-muted-foreground text-sm leading-relaxed sm:text-base lg:text-lg">
						Web analytics, error tracking, and feature flags in a single script
						under 30 KB. GDPR compliant out of the box. Used by 500+ teams.{" "}
						<Link
							className="text-foreground"
							href="https://github.com/databuddy-analytics/databuddy"
							rel="noopener noreferrer"
							target="_blank"
						>
							Open source
						</Link>
						{stars ? (
							<>
								{" · "}
								{formatLocaleNumber(stars)} GitHub stars
							</>
						) : null}
						.
					</p>

					<div className="flex items-center gap-3">
						<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
							<a href="https://app.databuddy.cc/login">Try it free</a>
						</SciFiButton>
						<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
							<Link href="/demo">Live demo</Link>
						</SciFiButton>
					</div>
				</div>

				<div className="mt-8 space-y-8">
					<div className="flex justify-center">
						<div className="relative flex items-center gap-0 border-border border-b">
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
											<div className="absolute right-0 bottom-0 left-0 h-0.5 bg-foreground" />
										) : null}
									</button>
								);
							})}
						</div>
					</div>

					<div className="group relative rounded border border-border/50 bg-card/30 p-1.5 shadow-2xl backdrop-blur-sm sm:p-2">
						<div className="relative min-h-[400px] overflow-hidden rounded bg-muted sm:min-h-[500px] lg:min-h-[600px]">
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
											"h-[400px] w-full rounded border-0 bg-muted shadow-inner sm:h-[500px] lg:h-[600px]",
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
		</section>
	);
}
