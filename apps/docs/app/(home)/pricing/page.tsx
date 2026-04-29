"use client";

import { useMemo, useState } from "react";
import { Footer } from "@/components/footer";
import { AiPricingSummary } from "./_pricing/ai-pricing-summary";
import { displayNameForPlan, selectBestPlan } from "./_pricing/best-plan";
import { Estimator } from "./_pricing/estimator";
import { estimateTieredOverageCostFromTiers } from "./_pricing/estimator-utils";
import { normalizePlans } from "./_pricing/normalize";
import { PlansComparisonTable } from "./_pricing/table";
import type { NormalizedPlan } from "./_pricing/types";
import { RAW_PLANS } from "./data";
import { PricingFaq } from "./pricing-faq";

const PLANS: NormalizedPlan[] = normalizePlans(RAW_PLANS);

export default function PricingPage() {
	const [monthlyEvents, setMonthlyEvents] = useState<number>(25_000);

	const bestPlan = useMemo(
		() => selectBestPlan(monthlyEvents, PLANS),
		[monthlyEvents]
	);

	const bestPlanDisplayName = useMemo(
		() => displayNameForPlan(monthlyEvents, PLANS, bestPlan),
		[monthlyEvents, bestPlan]
	);

	const estimatedOverage = useMemo(() => {
		const included = bestPlan ? bestPlan.includedEventsMonthly : 0;
		const over = Math.max(monthlyEvents - included, 0);
		if (!bestPlan?.eventTiers || over <= 0) {
			return 0;
		}
		return estimateTieredOverageCostFromTiers(over, bestPlan.eventTiers);
	}, [bestPlan, monthlyEvents]);

	const estimatedMonthly =
		(bestPlan ? bestPlan.priceMonthly : 0) + estimatedOverage;

	return (
		<div className="px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pt-32">
			<div className="mx-auto w-full max-w-7xl">
				<header className="mb-8 text-center sm:mb-10">
					<h1 className="mb-2 font-bold text-3xl tracking-tight sm:text-4xl">
						Every feature, every plan.
					</h1>
					<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
						Analytics, errors, vitals, and flags included at every tier. Pick a
						plan based on volume, not features. Fair tiered overage, and you
						only pay for what you use.
					</p>
				</header>

				<AiPricingSummary plans={RAW_PLANS} />

				<PlansComparisonTable plans={PLANS} />

				<Estimator
					bestPlan={bestPlan}
					bestPlanDisplayName={bestPlanDisplayName}
					estimatedMonthly={estimatedMonthly}
					estimatedOverage={estimatedOverage}
					monthlyEvents={monthlyEvents}
					setMonthlyEvents={setMonthlyEvents}
				/>

				<PricingFaq />
			</div>

			<Footer />
		</div>
	);
}
