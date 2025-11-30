"use client";

import { useSearchParams } from "next/navigation";
import PricingTable from "@/components/autumn/pricing-table";

export default function PlansPage() {
	const searchParams = useSearchParams();
	const selectedPlan = searchParams.get("plan");

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<div className="h-full p-5">
				<PricingTable selectedPlan={selectedPlan} />
			</div>
		</main>
	);
}
