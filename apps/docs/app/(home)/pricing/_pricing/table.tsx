import { formatMoney } from "./estimator-utils";
import { GatedFeaturePricingRows } from "./gated-feature-rows";
import type { NormalizedPlan } from "./types";

const cellClass = "px-4 py-3 text-center text-sm sm:px-5";

export function PlansComparisonTable({ plans }: { plans: NormalizedPlan[] }) {
	const rows = [
		{
			name: "Price / month",
			value: (plan: NormalizedPlan) =>
				plan.id === "enterprise" ? "Custom" : formatMoney(plan.priceMonthly),
		},
		{
			name: "Events / month",
			value: (plan: NormalizedPlan) =>
				plan.id === "enterprise"
					? "Custom"
					: plan.includedEventsMonthly.toLocaleString(),
		},
		{
			name: "Databunny chat",
			value: (plan: NormalizedPlan) =>
				plan.chatIncluded === null
					? "Custom"
					: plan.chatIncluded
						? "Included"
						: "—",
		},
		{
			name: "Investigations / month",
			value: (plan: NormalizedPlan) =>
				plan.id === "enterprise"
					? "Custom"
					: (plan.includedInvestigationsMonthly?.toLocaleString() ?? "—"),
		},
		{
			name: "Extra investigations",
			value: (plan: NormalizedPlan) =>
				plan.id === "enterprise"
					? "Custom"
					: plan.investigationPrice === null
						? "—"
						: `${formatMoney(plan.investigationPrice)} each`,
		},
		{
			name: "Extra events",
			value: (plan: NormalizedPlan) =>
				plan.id === "enterprise"
					? "Custom"
					: plan.eventTiers
						? "Tiered rates"
						: "Upgrade required",
		},
	];
	return (
		<details className="mb-10 border border-border bg-card/70">
			<summary className="cursor-pointer px-5 py-4 font-medium">
				Compare all features
			</summary>
			<div className="overflow-x-auto border-border border-t">
				<table className="w-full">
					<caption className="sr-only">Databuddy plan comparison</caption>
					<thead>
						<tr>
							<th className="px-4 py-3 text-left text-sm" scope="col">
								Feature
							</th>
							{plans.map((plan) => (
								<th className={cellClass} key={plan.id} scope="col">
									{plan.name}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr className="border-border border-t" key={row.name}>
								<th
									className="px-4 py-3 text-left font-normal text-muted-foreground text-sm"
									scope="row"
								>
									{row.name}
								</th>
								{plans.map((plan) => (
									<td className={cellClass} key={plan.id}>
										{row.value(plan)}
									</td>
								))}
							</tr>
						))}
						<GatedFeaturePricingRows
							plans={plans}
							planTdClassName={() => cellClass}
						/>
						{["SSO (SAML/OIDC)", "Audit logs", "Guided onboarding"].map(
							(name) => (
								<tr className="border-border border-t" key={name}>
									<th
										className="px-4 py-3 text-left font-normal text-muted-foreground text-sm"
										scope="row"
									>
										{name}
									</th>
									{plans.map((plan) => (
										<td className={cellClass} key={plan.id}>
											{plan.id === "enterprise" ? "Included" : "—"}
										</td>
									))}
								</tr>
							)
						)}
					</tbody>
				</table>
			</div>
		</details>
	);
}
