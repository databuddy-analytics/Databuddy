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

export {
	EASE,
	TH,
	TH_RIGHT,
} from "@/components/landing/demo-constants";

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

export function BottomFade({ className }: { className?: string }) {
	return (
		<div
			aria-hidden
			className={cn(
				"pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-linear-to-t from-background/100 via-background/50 to-transparent sm:h-20",
				className
			)}
		/>
	);
}

export function RightFade({ className }: { className?: string }) {
	return (
		<div
			aria-hidden
			className={cn(
				"pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-background/100 via-background/50 to-transparent sm:w-16",
				className
			)}
		/>
	);
}

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export function TwoColumnGrid({ children }: { children: ReactNode }) {
	return (
		<div className="relative grid w-full grid-cols-1 gap-px bg-border lg:grid-cols-2">
			{children}
		</div>
	);
}

export function GridCell({ children }: { children: ReactNode }) {
	return <div className="bg-background p-6 sm:p-8 lg:p-10">{children}</div>;
}

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

export const withDots = (text: string) =>
	text
		.split("·")
		.map((part, position) => ({ part, position }))
		.flatMap(({ part, position }) =>
			position === 0
				? [part]
				: [
						<span className="font-sans" key={position}>
							·
						</span>,
						part,
					]
		);

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
	titleMuted,
	body,
	points,
	visual,
	flip = false,
	children,
}: {
	id: string;
	title: string;
	titleMuted: string;
	body: string;
	points: readonly string[];
	visual: ReactNode;
	flip?: boolean;
	children?: ReactNode;
}) {
	return (
		<Section className="border-border border-b" id={id}>
			<div
				className={cn(
					container,
					"grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
				)}
			>
				<div className={cn("flex flex-col", flip && "lg:order-2")}>
					<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl">
						{title} <span className="text-muted-foreground">{titleMuted}</span>
					</h2>
					<p className="mt-3 max-w-xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
						{body}
					</p>
					<ul className="mt-6 flex flex-col gap-2.5">
						{points.map((point) => (
							<li className="flex gap-3 text-foreground/90 text-sm" key={point}>
								<span className="mt-1.5 size-1.5 shrink-0 bg-brand-amber" />
								{point}
							</li>
						))}
					</ul>
					{children}
				</div>
				<div className="min-w-0">{visual}</div>
			</div>
		</Section>
	);
}
