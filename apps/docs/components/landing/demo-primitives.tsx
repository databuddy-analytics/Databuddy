"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Section from "@/components/landing/section";
import { Button } from "@databuddy/ui";
import { cn } from "@/lib/utils";

export {
	CELL_TITLE_CLASS,
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
	badge,
}: {
	title: string;
	subtitle: string;
	primaryLabel?: string;
	primaryHref?: string;
	docsHref?: string;
	badge?: ReactNode;
}) {
	return (
		<Section className="border-border border-b" id="hero">
			<div className={container}>
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
							<a href={primaryHref}>{primaryLabel}</a>
						</Button>
						<Button asChild variant="secondary">
							<Link href={docsHref}>Read Docs</Link>
						</Button>
					</div>
				</div>
			</div>
		</Section>
	);
}
