"use client";

import { useSearchParams } from "next/navigation";
import PricingTable from "@/components/autumn/pricing-table";

export default function PlansPage() {
	const searchParams = useSearchParams();
	const selectedPlan = searchParams.get("plan");

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<div className="border-b px-5 py-4">
				<h2 className="font-semibold">Plans</h2>
				<p className="text-muted-foreground text-sm">
					Choose the plan that fits your needs
				</p>
			</div>
			<div className="p-5">
				<PricingTable selectedPlan={selectedPlan} />
			</div>
		</main>
	);
}
