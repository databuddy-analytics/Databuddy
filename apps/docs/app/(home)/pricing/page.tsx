"use client";

import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";

import { Footer } from "@/components/footer";
import { AiPricingSummary } from "./_pricing/ai-pricing-summary";
import { Estimator } from "./_pricing/estimator";
import { IntelligenceSection } from "./_pricing/intelligence-section";
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
						Find the plan that fits your product.
					</h1>
					<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
						Compare analytics plans by usage and capabilities. Investigations
						remain invite only and are purchased separately at $
						{INVESTIGATION_USAGE.priceUsd} per completed investigation.
					</p>
				</header>

				<AiPricingSummary plans={RAW_PLANS} />

				<PlansComparisonTable plans={PLANS} />

				<section
					aria-label="Investigation pricing"
					className="mb-10 border border-border bg-card p-6"
				>
					<h2 className="font-semibold text-2xl">$1 per investigation</h2>
					<p className="mt-2 text-muted-foreground">
						{INVESTIGATION_USAGE.description}
					</p>
					<p className="mt-2 text-muted-foreground text-sm">
						Buy only what you need. Prepaid investigations do not expire. Plan
						AI credits pay for ordinary chat; no investigations are bundled with
						new plan versions. Existing balances and legacy investigation terms
						are preserved until you buy investigations or switch to a new plan
						version.
					</p>
				</section>

				<IntelligenceSection />

				<Estimator plans={PLANS} />

				<PricingFaq />
			</div>

			<Footer />
		</div>
	);
}
