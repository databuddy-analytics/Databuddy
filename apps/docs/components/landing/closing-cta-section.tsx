"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ClosingCtaSectionProps {
	docsHref?: string;
	title?: ReactNode;
	subtitle?: string;
	primaryCta?: { href: string; label: string };
	secondaryCta?: { href: string; label: string };
}

const DEFAULT_SUBTITLE =
	"Free up to 10,000 events. No credit card required. Two minutes to set up.";

export function ClosingCtaSection({
	docsHref = "/docs",
	title,
	subtitle = DEFAULT_SUBTITLE,
	primaryCta = {
		href: "https://app.databuddy.cc/login",
		label: "Start Monitoring",
	},
	secondaryCta = { href: docsHref, label: "Read Docs" },
}: ClosingCtaSectionProps) {
	return (
		<section className="relative flex min-h-[36rem] flex-col items-center justify-center overflow-hidden border-border border-t bg-background px-4 py-24 sm:min-h-[38rem] sm:px-6 lg:min-h-[42rem] lg:px-8 lg:py-36">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 overflow-hidden"
			>
				<div className="relative size-full scale-[1.05]">
					<Image
						alt=""
						className="object-cover object-right-bottom"
						fill
						priority={false}
						sizes="100vw"
						src="/brand/gradients/gradient-bg-1.jpg"
					/>
				</div>
			</div>
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-black/40"
			/>

			<div className="relative z-10 w-full max-w-7xl text-center">
				<h2 className="text-balance font-semibold text-4xl text-white leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
					{title ?? (
						<>
							<span className="block">One script.</span>
							<span className="block">The full picture.</span>
						</>
					)}
				</h2>
				<p className="mx-auto mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
					{subtitle}
				</p>
				<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
					<Button asChild className="px-6 py-5 text-base sm:px-8">
						<a href={primaryCta.href}>{primaryCta.label}</a>
					</Button>
					<Button
						asChild
						className="px-6 py-5 text-base sm:px-8"
						variant="secondary"
					>
						<Link href={secondaryCta.href}>{secondaryCta.label}</Link>
					</Button>
				</div>
			</div>
		</section>
	);
}
