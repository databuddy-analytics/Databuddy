"use client";

import { ChoosePlan } from "@/app/(main)/onboarding/_components/choose-plan";

export function ChoosePlanHarness() {
	return (
		<ChoosePlan
			finish={{ label: "Open dashboard", onClick: () => {} }}
			onBack={() => {}}
			successPath="/onboarding?want=analytics&website=e2e-site&step=plan"
		/>
	);
}
