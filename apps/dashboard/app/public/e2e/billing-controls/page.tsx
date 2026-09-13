import { readBooleanEnv } from "@databuddy/env/app";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BillingControlsFixture } from "@/test/e2e/billing-controls-fixture";

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
	return <BillingControlsFixture />;
}
