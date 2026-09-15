"use client";

import { parseAsString, useQueryState } from "nuqs";
import { Suspense } from "react";
import PricingTable from "@/components/autumn/pricing-table";
import { SpinnerIcon } from "@databuddy/ui/icons";

function PlansPageContent() {
	const [selectedPlan] = useQueryState("plan", parseAsString);

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<div className="h-full p-5">
				<PricingTable selectedPlan={selectedPlan} />
			</div>
		</main>
	);
}

export default function PlansPage() {
	return (
		<Suspense
			fallback={
				<main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
					<SpinnerIcon className="size-8 animate-spin text-primary motion-reduce:animate-none" />
				</main>
			}
		>
			<PlansPageContent />
		</Suspense>
	);
}
