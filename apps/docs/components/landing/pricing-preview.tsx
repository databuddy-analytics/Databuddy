"use client";

import { ArrowRightIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import { Estimator } from "@/app/(home)/pricing/_pricing/estimator";
import { normalizePlans } from "@/app/(home)/pricing/_pricing/normalize";
import type { NormalizedPlan } from "@/app/(home)/pricing/_pricing/types";
import { RAW_PLANS } from "@/app/(home)/pricing/data";
import { SectionBullet } from "../icons/section-bullet";

const PLANS: NormalizedPlan[] = normalizePlans(RAW_PLANS);

export function PricingPreview() {
	return (
		<div className="w-full">
			<div className="mb-10 text-start lg:mb-12 lg:text-left">
				<h2 className="mx-auto flex max-w-4xl items-start gap-2 text-balance font-semibold text-2xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
					<span className="mt-1.5 hidden sm:block">
						<SectionBullet color="#3E8E6A" />
					</span>
					<span className="text-foreground">
						Know your bill before you sign up.
					</span>
				</h2>
				<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
					Every feature on every plan. Slide to your event volume and see the
					number. No sales call, no feature gates.
				</p>
			</div>

			<Estimator plans={PLANS} />

			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<p className="text-muted-foreground/70 text-xs">
					Free up to 10,000 events/mo. No credit card required.
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
