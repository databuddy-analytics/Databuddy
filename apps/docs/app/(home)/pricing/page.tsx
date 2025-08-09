'use client';

import { useMemo, useState } from 'react';
import { Footer } from '@/components/footer';
import { displayNameForPlan, selectBestPlan } from './@pricing/best-plan';
import { Estimator } from './@pricing/estimator';
import { estimateTieredOverageCostFromTiers } from './@pricing/estimator-utils';
import { normalizePlans } from './@pricing/normalize';
import { PlansComparisonTable } from './@pricing/table';
import type { NormalizedPlan } from './@pricing/types';
import { RAW_PLANS } from './data';

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

	const estimatedMonthly = useMemo(
		() => (bestPlan ? bestPlan.priceMonthly : 0) + estimatedOverage,
		[bestPlan, estimatedOverage]
	);

	return (
		<div className="px-4 py-10 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-7xl">
				<header className="mb-8 text-center sm:mb-10">
					<h1 className="mb-2 font-bold text-3xl tracking-tight sm:text-4xl">
						Pricing
					</h1>
					<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base">
						TL;DR — simple plans, fair tiered overage, and you only pay for what
						you use.
					</p>
				</header>

				<PlansComparisonTable plans={PLANS} />

				<Estimator
					bestPlan={bestPlan}
					bestPlanDisplayName={bestPlanDisplayName}
					estimatedMonthly={estimatedMonthly}
					estimatedOverage={estimatedOverage}
					monthlyEvents={monthlyEvents}
					setMonthlyEvents={setMonthlyEvents}
				/>

				<Footer />
			</div>
		</div>
	);
}
