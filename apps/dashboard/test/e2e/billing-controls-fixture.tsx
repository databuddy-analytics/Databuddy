"use client";

import { AutumnProvider } from "autumn-js/react";
import { BillingControlsCard } from "@/app/(main)/billing/components/billing-controls-card";

export function BillingControlsFixture() {
	return (
		<AutumnProvider>
			<main className="overflow-auto p-5">
				<div className="mx-auto max-w-2xl">
					<BillingControlsCard />
				</div>
			</main>
		</AutumnProvider>
	);
}
