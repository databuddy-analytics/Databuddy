"use client";

import { Footer } from "@/components/footer";
import { AiPricingSummary } from "./_pricing/ai-pricing-summary";
import { Estimator } from "./_pricing/estimator";
import { normalizePlans } from "./_pricing/normalize";
import { PlansComparisonTable } from "./_pricing/table";
import type { NormalizedPlan } from "./_pricing/types";
import { RAW_PLANS } from "./data";
import { PricingFaq } from "./pricing-faq";

const PLANS: NormalizedPlan[] = normalizePlans(RAW_PLANS);

export default function PricingPage() {
	return (
		<div className="px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pt-32">
			<div className="mx-auto w-full max-w-7xl">
				<header className="mb-8 text-center sm:mb-10">
					<h1 className="mb-2 font-bold text-3xl tracking-tight sm:text-4xl">
						Every feature, every plan.
					</h1>
					<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
						Analytics, uptime monitoring, link management, error tracking, web
						vitals, feature flags, and more included at every tier. Pick a plan
						based on volume, not features.
					</p>
				</header>

				<AiPricingSummary plans={RAW_PLANS} />

				<PlansComparisonTable plans={PLANS} />

				<Estimator plans={PLANS} />

				<PricingFaq />
			</div>

			<Footer />
		</div>
	);
}
