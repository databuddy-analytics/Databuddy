"use client";

import { parseAsString, useQueryState } from "nuqs";
import PricingTable from "@/components/autumn/pricing-table";

export default function PlansPage() {
	const [selectedPlan] = useQueryState("plan", parseAsString);

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<div className="h-full p-5">
				<PricingTable selectedPlan={selectedPlan} />
			</div>
		</main>
	);
}
