"use client";

import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { SciFiButton } from "./scifi-btn";
import { Spotlight } from "./spotlight";

const tabs = [
	{
		id: "overview",
		label: "Overview",
		path: "",
	},
	{
		id: "events",
		label: "Events",
		path: "/events",
	},
	{
		id: "errors",
		label: "Errors",
		path: "/errors",
	},
	{
		id: "vitals",
		label: "Vitals",
		path: "/vitals",
	},
	{
		id: "funnels",
		label: "Funnels",
		path: "/funnels",
	},
	{
		id: "flags",
		label: "Flags",
		path: "/flags",
	},
];

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
	const [activeTab, setActiveTab] = useState(tabs[0].id);
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const baseUrl = demoEmbedBaseUrl;
	const activeTabData = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
	const iframeSrc = `${baseUrl}${activeTabData.path}?embed=true`;

	const handleFullscreen = async () => {
		const element = iframeRef.current as FullscreenElement | null;
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
					<h1 className="fade-in slide-in-from-bottom-6 animate-in text-balance font-bold text-4xl leading-[1.1] tracking-tight delay-100 duration-700 sm:text-5xl md:text-6xl lg:text-7xl">
						Analytics that{" "}
						<span className="underline decoration-2 decoration-wavy underline-offset-8">
							runs <span className="text-muted-foreground">itself</span>
						</span>
					</h1>

					<p className="fade-in slide-in-from-bottom-6 max-w-2xl animate-in text-pretty font-medium text-muted-foreground text-sm leading-relaxed delay-200 duration-700 sm:text-base lg:text-lg">
						Usage, errors, and experiments in one layer.{" "}
						<Link
							className="text-foreground"
							href="https://github.com/databuddy-analytics/databuddy"
						>
							Open source
						</Link>{" "}
						and autonomous.
					</p>

					<div className="fade-in slide-in-from-bottom-6 animate-in delay-300 duration-700">
						<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
							<a
								href="https://app.databuddy.cc/login"
								rel="noopener noreferrer"
								target="_blank"
							>
								Get early access
							</a>
						</SciFiButton>
					</div>
				</div>

				{/* Feature Tabs Section */}
				<div className="fade-in slide-in-from-bottom-8 mt-8 animate-in space-y-8 delay-400 duration-1000">
					{/* Tabs Navigation */}
					<div className="flex justify-center">
						<div className="relative flex items-center gap-0 border-border border-b">
							{tabs.map((tab) => {
								const isActive = activeTab === tab.id;
								return (
									<button
										className={`relative cursor-pointer px-4 py-3 font-medium text-sm transition-colors duration-200 sm:px-6 sm:py-3.5 sm:text-base ${
											isActive
												? "text-foreground"
												: "text-muted-foreground hover:text-foreground"
										}`}
										key={tab.id}
										onClick={() => setActiveTab(tab.id)}
										type="button"
									>
										{tab.label}
										{isActive && (
											<motion.div
												className="absolute right-0 bottom-0 left-0 h-0.5 bg-foreground"
												layoutId="hero-tab-underline"
												transition={{
													type: "spring",
													stiffness: 500,
													damping: 35,
												}}
											/>
										)}
									</button>
								);
							})}
						</div>
					</div>

					{/* Iframe Container */}
					<div className="group relative rounded border border-border/50 bg-card/30 p-1.5 shadow-2xl backdrop-blur-sm sm:p-2">
						<AnimatePresence mode="wait">
							<motion.div
								animate={{ opacity: 1 }}
								className="relative"
								exit={{ opacity: 0 }}
								initial={{ opacity: 0 }}
								key={activeTab}
								transition={{ duration: 0.15 }}
							>
								<iframe
									allowFullScreen
									className="h-[400px] w-full rounded border-0 bg-background shadow-inner sm:h-[500px] lg:h-[600px]"
									loading="lazy"
									ref={iframeRef}
									src={iframeSrc}
									title={`Databuddy ${activeTabData.label} Demo`}
								/>
							</motion.div>
						</AnimatePresence>

						{/* Fullscreen Button Overlay */}
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
