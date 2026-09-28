"use client";

import {
	AnimatePresence,
	motion,
	useInView,
	useReducedMotion,
} from "motion/react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Section from "@/components/landing/section";
import { Button } from "@databuddy/ui";
import { flush, track } from "@databuddy/sdk";
import { cn } from "@/lib/utils";
import { SECTION_SPACING } from "@/components/landing/demo-constants";

export function useRevealOnScroll() {
	const ref = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry?.isIntersecting || el.dataset.animated === "true") {
					return;
				}
				el.dataset.animated = "true";
				setVisible(true);
			},
			{ threshold: 0.2, rootMargin: "0px 0px -60px 0px" }
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return { ref, visible };
}

export function CardChrome({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"rounded border border-white/[0.06] bg-white/[0.02]",
				className
			)}
		>
			{children}
		</div>
	);
}

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export function SectionHeader({
	title,
	titleMuted,
	subtitle,
}: {
	title: string;
	titleMuted?: string;
	subtitle: string;
}) {
	return (
		<div className="mb-12 lg:mb-16">
			<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
				{title}{" "}
				{titleMuted && (
					<span className="text-muted-foreground">{titleMuted}</span>
				)}
			</h2>
			<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
				{subtitle}
			</p>
		</div>
	);
}

export function FeatureHero({
	title,
	subtitle,
	primaryLabel = "Start Free",
	primaryHref = "https://app.databuddy.cc/register",
	docsHref = "/docs",
	secondaryLabel = "Read Docs",
	badge,
	footnote = "Free up to 10,000 events/mo. No credit card required.",
	visual,
}: {
	title: string;
	subtitle: string;
	primaryLabel?: string;
	primaryHref?: string;
	docsHref?: string;
	secondaryLabel?: string;
	badge?: ReactNode;
	footnote?: ReactNode;
	visual?: ReactNode;
}) {
	const pathname = usePathname();

	return (
		<Section className="border-border border-b" id="hero">
			<div
				className={cn(
					container,
					visual && "grid items-center gap-10 lg:grid-cols-[5fr_6fr] lg:gap-16"
				)}
			>
				<div className="flex max-w-3xl flex-col items-start space-y-4">
					{badge}
					<h1 className="text-balance font-semibold text-3xl sm:text-5xl md:text-6xl">
						{title}
					</h1>
					<p className="max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
						{subtitle}
					</p>
					<div className="flex items-center gap-3 pt-1">
						<Button asChild>
							<a
								href={primaryHref}
								onClick={() => {
									track("signup_cta_clicked", {
										page: pathname?.split("/").filter(Boolean)[0] ?? "home",
										placement: "hero",
									});
									flush();
								}}
							>
								{primaryLabel}
							</a>
						</Button>
						<Button asChild variant="secondary">
							<Link href={docsHref}>{secondaryLabel}</Link>
						</Button>
					</div>
					{footnote ? (
						<div className="text-muted-foreground text-xs">{footnote}</div>
					) : null}
				</div>
				{visual}
			</div>
		</Section>
	);
}

export const IN_OUT = [0.65, 0, 0.35, 1] as const;

const HASH_MODULUS = 2_147_483_647;

export const pseudoRandom = (seed: string) => {
	let hash = 7;
	for (const char of seed) {
		hash = (hash * 31 + char.charCodeAt(0)) % HASH_MODULUS;
	}
	for (let round = 0; round < 3; round++) {
		hash = (hash * 48_271) % HASH_MODULUS;
	}
	return hash / HASH_MODULUS;
};

export const rounded = (value: number) => Math.round(value * 100) / 100;

export const toPath = (points: [number, number][]) =>
	`M ${points.map(([x, y]) => `${rounded(x)} ${rounded(y)}`).join(" L ")}`;

export const percent = (value: number, of: number) =>
	`${rounded((value / of) * 100)}%`;

export const enter = (delay: number, distance = 8) => ({
	initial: { opacity: 0, y: distance },
	animate: { opacity: 1, y: 0 },
	transition: { duration: 0.5, ease: IN_OUT, delay },
});

export const useAfter = (seconds: number, key: unknown = seconds) => {
	const [doneFor, setDoneFor] = useState<unknown>(undefined);
	useEffect(() => {
		const id = window.setTimeout(() => setDoneFor(key), seconds * 1000);
		return () => window.clearTimeout(id);
	}, [seconds, key]);
	return doneFor === key;
};

export const useCount = (times: readonly number[]) => {
	const [count, setCount] = useState(0);
	useEffect(() => {
		const ids = times.map((time) =>
			window.setTimeout(() => setCount((current) => current + 1), time * 1000)
		);
		return () => {
			for (const id of ids) {
				window.clearTimeout(id);
			}
		};
	}, [times]);
	return count;
};

export const FRAME = "border border-white/[0.06] bg-white/[0.02]";
export const REWIND = { duration: 0.4, ease: IN_OUT } as const;

export const pick = <T,>(items: readonly [T, ...T[]], index: number) =>
	items[index % items.length] ?? items[0];

export const useTimeline = (events: readonly number[], seconds: number) => {
	const ref = useRef<HTMLDivElement>(null);
	const visible = useInView(ref, { amount: 0.35 });
	const reduce = useReducedMotion();
	const [cycle, setCycle] = useState(0);
	const [step, setStep] = useState(0);
	useEffect(() => {
		if (reduce) {
			setStep(events.length);
			return;
		}
		setStep(0);
		if (!visible) {
			return;
		}
		const ids = events.map((time, index) =>
			window.setTimeout(() => setStep(index + 1), time * 1000)
		);
		ids.push(
			window.setTimeout(() => {
				setStep(0);
				setCycle((current) => current + 1);
			}, seconds * 1000)
		);
		return () => {
			for (const id of ids) {
				window.clearTimeout(id);
			}
		};
	}, [events, seconds, visible, reduce, cycle]);
	return { ref, step, cycle };
};

export function SlackLogo({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="currentColor"
			viewBox="0 0 24 24"
		>
			<path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
		</svg>
	);
}

export function LinkedinLogo({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="currentColor"
			viewBox="0 0 24 24"
		>
			<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
		</svg>
	);
}

export function StatusLine({
	tone,
	children,
}: {
	tone: "amber" | "red" | "emerald" | "muted";
	children: string;
}) {
	return (
		<AnimatePresence initial={false} mode="wait">
			<motion.span
				animate={{ opacity: 1, y: 0 }}
				className={cn(
					"flex items-center gap-2 text-[12px] sm:text-sm",
					tone === "amber" && "text-brand-amber",
					tone === "red" && "text-red-500",
					tone === "emerald" && "text-emerald-500",
					tone === "muted" && "text-muted-foreground"
				)}
				exit={{ opacity: 0, y: -4 }}
				initial={{ opacity: 0, y: 4 }}
				key={children}
				transition={{ duration: 0.25, ease: IN_OUT }}
			>
				<span className="size-2 shrink-0 bg-current" />
				{children}
			</motion.span>
		</AnimatePresence>
	);
}

export function Reveal({
	shown,
	delay = 0,
	distance = 6,
	className,
	children,
}: {
	shown: boolean;
	delay?: number;
	distance?: number;
	className?: string;
	children: ReactNode;
}) {
	return (
		<motion.div
			animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: distance }}
			className={className}
			initial={false}
			transition={shown ? { duration: 0.45, ease: IN_OUT, delay } : REWIND}
		>
			{children}
		</motion.div>
	);
}

export function FeatureRow({
	id,
	title,
	body,
	visual,
	flip = false,
}: {
	id: string;
	title: string;
	body: string;
	visual: ReactNode;
	flip?: boolean;
}) {
	return (
		<Section
			className={cn("border-border border-b", SECTION_SPACING)}
			customPaddings
			id={id}
		>
			<div
				className={cn(
					container,
					"grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
				)}
			>
				<div className={cn("flex flex-col", flip && "lg:order-2")}>
					<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl">
						{title}
					</h2>
					<p className="mt-3 max-w-xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
						{body}
					</p>
				</div>
				<div className="min-w-0">{visual}</div>
			</div>
		</Section>
	);
}
