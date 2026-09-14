"use client";

import { Footer } from "@/components/footer";
import { Estimator } from "./_pricing/estimator";
import { normalizePlans } from "./_pricing/normalize";
import { PlansComparisonTable } from "./_pricing/table";
import type { NormalizedPlan } from "./_pricing/normalize";
import { RAW_PLANS } from "./data";
import { PricingFaq } from "./pricing-faq";

const PLANS: NormalizedPlan[] = normalizePlans(RAW_PLANS);

export default function PricingPage() {
	return (
		<div className="px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pt-32">
			<div className="mx-auto w-full max-w-7xl">
				<header className="mb-8 text-center sm:mb-10">
					<h1 className="mb-2 text-balance font-bold text-3xl tracking-tight sm:text-4xl">
						Find the plan that fits your product.
					</h1>
					<p className="mx-auto max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base">
						Databunny chat is included. Business and Scale add monthly
						investigations.
					</p>
				</header>

				<PlansComparisonTable plans={PLANS} />

				<Estimator plans={PLANS} />

				<PricingFaq />
			</div>

			<Footer />
		</div>
	);
}
