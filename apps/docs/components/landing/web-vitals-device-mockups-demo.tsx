"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const SWAP_EASE = [0.16, 1, 0.3, 1] as const;
const SWAP_DURATION_S = 0.2;

function PlaceholderLines({ className }: { className?: string }) {
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<div className="h-1 w-[82%] rounded bg-muted-foreground/20" />
			<div className="h-1 w-[58%] rounded bg-muted-foreground/20" />
			<div className="h-1 w-full rounded bg-muted-foreground/20" />
			<div className="h-1 w-[68%] rounded bg-muted-foreground/20" />
			<div className="h-1 w-[44%] rounded bg-muted-foreground/20" />
		</div>
	);
}

function GoodBadge() {
	return (
		<div className="inline-flex items-center gap-1.5 rounded border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 font-mono text-emerald-400 text-xs tabular-nums">
			<span aria-hidden className="size-1.5 rounded-full bg-emerald-400" />
			<span>98</span>
			<span aria-hidden className="text-emerald-400/60">
				·
			</span>
			<span>Good</span>
		</div>
	);
}

function PoorBadge() {
	return (
		<div className="inline-flex items-center gap-1.5 rounded border border-red-400/35 bg-red-500/10 px-2 py-1 font-mono text-red-400 text-xs tabular-nums">
			<span aria-hidden className="size-1.5 rounded-full bg-red-400" />
			<span>54</span>
			<span aria-hidden className="text-red-400/60">
				·
			</span>
			<span>Poor</span>
		</div>
	);
}

function deviceFrameMotion(isActive: boolean): {
	opacity: number;
	scale: number;
	y: number;
	zIndex: number;
} {
	if (isActive) {
		return {
			opacity: 1,
			scale: 1,
			y: -8,
			zIndex: 20,
		};
	}
	return {
		opacity: 0.38,
		scale: 0.92,
		y: 14,
		zIndex: 10,
	};
}

export function WebVitalsDeviceMockupsDemo() {
	const [topDevice, setTopDevice] = useState<"desktop" | "mobile">("desktop");
	const [reduceMotion, setReduceMotion] = useState(false);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduceMotion(mq.matches);
		const onChange = () => {
			setReduceMotion(mq.matches);
		};
		mq.addEventListener("change", onChange);
		return () => {
			mq.removeEventListener("change", onChange);
		};
	}, []);

	const transition = reduceMotion
		? { duration: 0 }
		: { duration: SWAP_DURATION_S, ease: SWAP_EASE };

	const desktopActive = topDevice === "desktop";
	const mobileActive = topDevice === "mobile";

	return (
		<div className="relative mb-4 w-full overflow-visible">
			<div className="relative min-h-[17rem] overflow-visible px-3 sm:min-h-[18.5rem]">
				<motion.button
					animate={deviceFrameMotion(desktopActive)}
					aria-label="Show desktop vitals preview"
					aria-pressed={desktopActive}
					className={cn(
						"absolute top-14 left-0 w-[min(100%,17.5rem)] max-w-[76%] cursor-pointer rounded border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					)}
					onClick={() => {
						setTopDevice("desktop");
					}}
					style={{ transformOrigin: "50% 100%" }}
					transition={transition}
					type="button"
				>
					<div className="flex flex-col items-center">
						<div
							className={cn(
								"w-full rounded p-1.5 shadow-sm",
								desktopActive
									? "border border-border/75 bg-muted/25 shadow-md"
									: "border border-border/15 bg-muted/10 shadow-none"
							)}
						>
							<div className="flex gap-1 pb-1.5">
								<span
									aria-hidden
									className="size-2 shrink-0 rounded-full bg-red-500/85"
								/>
								<span
									aria-hidden
									className="size-2 shrink-0 rounded-full bg-amber-400/90"
								/>
								<span
									aria-hidden
									className="size-2 shrink-0 rounded-full bg-emerald-500/85"
								/>
							</div>
							<div className="relative min-h-[5.5rem] rounded bg-background/35 p-2 sm:min-h-[6.25rem]">
								<PlaceholderLines className="opacity-90" />
								<div className="pointer-events-none absolute bottom-1 left-1">
									<GoodBadge />
								</div>
							</div>
						</div>
						<div
							aria-hidden
							className="h-3 w-[9%] min-w-[8px] max-w-[14px] rounded-b bg-border/65"
						/>
						<div
							aria-hidden
							className="h-2.5 w-[40%] max-w-[7.5rem] rounded-b border border-border/45 bg-muted/45"
						/>
					</div>
				</motion.button>

				<motion.button
					animate={deviceFrameMotion(mobileActive)}
					aria-label="Show mobile vitals preview"
					aria-pressed={mobileActive}
					className={cn(
						"absolute right-[2%] bottom-[6%] w-[34%] min-w-[6.75rem] max-w-[9.25rem] cursor-pointer rounded border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
					)}
					onClick={() => {
						setTopDevice("mobile");
					}}
					style={{ transformOrigin: "50% 100%" }}
					transition={transition}
					type="button"
				>
					<div className="flex flex-col items-center">
						<div
							className={cn(
								"relative flex w-full flex-col overflow-hidden rounded-[2rem] p-1.5 shadow-sm [aspect-ratio:9/18]",
								mobileActive
									? "border border-border/75 bg-muted/25 shadow-md"
									: "border border-border/15 bg-muted/10 shadow-none"
							)}
						>
							<div
								aria-hidden
								className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2"
							>
								<div className="h-5 w-[4.25rem] rounded-b-[0.65rem] border border-border/55 border-t-0 bg-background/95 shadow-sm" />
							</div>
							<div className="relative min-h-0 flex-1 overflow-hidden rounded-[1.35rem] bg-background/35 pt-5">
								<div className="p-2 pt-0">
									<PlaceholderLines className="gap-1.5" />
								</div>
								<div className="pointer-events-none absolute top-[40%] left-1">
									<PoorBadge />
								</div>
							</div>
						</div>
					</div>
				</motion.button>
			</div>
		</div>
	);
}
