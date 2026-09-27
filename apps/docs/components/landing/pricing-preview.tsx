"use client";

import { ArrowRightIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import type { NormalizedPlan } from "@/app/(home)/pricing/_pricing/normalize";
import { normalizePlans } from "@/app/(home)/pricing/_pricing/normalize";
import { RAW_PLANS } from "@/app/(home)/pricing/data";
import { SectionBullet } from "../icons/section-bullet";

const SELF_SERVE_PLAN_IDS = ["free", "hobby", "pro"] as const;

const PLANS: NormalizedPlan[] = normalizePlans(RAW_PLANS);

const selfServePlans = SELF_SERVE_PLAN_IDS.map((id) =>
	PLANS.find((plan) => plan.id === id)
).filter((plan): plan is NormalizedPlan => Boolean(plan));

function formatEvents(events: number) {
	return events >= 1_000_000
		? `${events / 1_000_000}M events/mo`
		: `${events / 1000}K events/mo`;
}

function formatPrice(price: number) {
	return price === 0 ? "Free" : `$${price}`;
}

export function PricingPreview() {
	return (
		<div className="w-full">
			<div className="mb-10 text-start lg:mb-12 lg:text-left">
				<h2 className="mx-auto flex max-w-4xl items-start gap-2 text-balance font-semibold text-2xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
					<span className="mt-1.5 hidden sm:block">
						<SectionBullet color="#3E8E6A" />
					</span>
					<span className="text-foreground">
						10,000 events free, then from $9.99.
					</span>
				</h2>
				<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
					No credit card and no sales call. Free includes real-time analytics,
					web vitals, one funnel, and three feature flags.
				</p>
			</div>

			<div className="grid gap-px border border-border bg-border sm:grid-cols-3">
				{selfServePlans.map((plan) => (
					<div className="flex flex-col gap-1 bg-card p-6" key={plan.id}>
						<span className="font-medium font-mono text-muted-foreground text-xs uppercase tracking-wide">
							{plan.name}
						</span>
						<span className="font-semibold text-3xl text-foreground tabular-nums">
							{formatPrice(plan.priceMonthly)}
							{plan.priceMonthly > 0 && (
								<span className="ml-1 font-normal text-muted-foreground text-sm">
									/mo
								</span>
							)}
						</span>
						<span className="text-muted-foreground text-sm">
							{formatEvents(plan.includedEventsMonthly)}
						</span>
					</div>
				))}
			</div>

			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<p className="text-muted-foreground/70 text-xs">
					Scales to 250M+ events/mo. Set a billing limit and ingestion stops
					instead of surprising you.
				</p>
				<Link
					className="inline-flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
					href="/pricing"
				>
					See the full plan comparison
					<ArrowRightIcon className="size-3.5" />
				</Link>
			</div>
		</div>
	);
}
