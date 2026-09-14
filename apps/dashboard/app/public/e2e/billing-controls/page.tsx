import { readBooleanEnv } from "@databuddy/env/app";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AutumnProvider } from "autumn-js/react";
import { BillingControlsCard } from "@/app/(main)/billing/components/billing-controls-card";

export default async function BillingControlsTestPage() {
	const requestHeaders = await headers();
	if (
		!(
			readBooleanEnv("DATABUDDY_E2E_MODE") && process.env.DATABUDDY_E2E_TEST_KEY
		) ||
		requestHeaders.get("x-e2e-test-key") !== process.env.DATABUDDY_E2E_TEST_KEY
	) {
		notFound();
	}
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
