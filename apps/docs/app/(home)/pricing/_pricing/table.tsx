import { INTELLIGENCE_CONTACT_TOPICS } from "@databuddy/shared/types/features";
import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { SciFiCard } from "@/components/scifi-card";
import { formatMoney } from "./estimator-utils";
import { GatedFeaturePricingRows } from "./gated-feature-rows";
import { trackPricingPlanClick } from "./track-pricing";
import type { NormalizedPlan } from "./normalize";

const contactTopics: Record<string, string | undefined> =
	INTELLIGENCE_CONTACT_TOPICS;

function cellClass(planId: string) {
	return `px-3 py-3 text-center text-sm sm:px-4 ${planId === "pro" ? "border-x border-border bg-primary/10" : ""}`;
}

export function PlansComparisonTable({ plans }: { plans: NormalizedPlan[] }) {
	const rows = [
		{
			name: "Price / month",
			value: (plan: NormalizedPlan) =>
				plan.id === "enterprise"
					? "Custom"
					: plan.priceMonthly === 0
						? "Free"
						: formatMoney(plan.priceMonthly),
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
						: `${formatMoney(plan.investigationPrice)} per extra`,
		},
		{
			name: "Events / month",
			value: (plan: NormalizedPlan) =>
				plan.id === "enterprise"
					? "Custom"
					: plan.includedEventsMonthly.toLocaleString(),
		},
		{
			name: "AI credits",
			value: (plan: NormalizedPlan) => {
				if (!plan.agentCredits) {
					return "Custom";
				}
				const monthly = `${plan.agentCredits.month.toLocaleString()} / month`;
				return plan.agentCredits.day
					? `${monthly} + ${plan.agentCredits.day.toLocaleString()} / day`
					: monthly;
			},
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
		{
			name: "Support",
			value: (plan: NormalizedPlan) =>
				({
					free: "Community",
					hobby: "Email",
					pro: "Priority email",
					intelligence: "Priority email + Slack",
					intelligence_scale: "Priority email + Slack",
				})[plan.id] ?? "Custom",
		},
	];
	return (
		<section className="mb-10 motion-reduce:[&_*]:animate-none! motion-reduce:[&_*]:transition-none!">
			<SciFiCard className="border border-border bg-card/70 shadow-inner backdrop-blur-sm">
				<section
					aria-label="Plan comparison"
					className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the wide comparison table on narrow screens.
					tabIndex={0}
				>
					<table className="w-full min-w-5xl">
						<caption className="sr-only">Databuddy plan comparison</caption>
						<thead className="border-border border-b bg-card/20">
							<tr>
								<th
									className="w-56 min-w-56 px-4 py-3 text-left text-sm sm:px-5 lg:px-6"
									scope="col"
								>
									Feature
								</th>
								{plans.map((plan) => (
									<th
										className={cellClass(plan.id)}
										id={plan.id}
										key={plan.id}
										scope="col"
									>
										<span className="font-medium">{plan.name}</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr
									className="border-border border-t transition-colors duration-150 hover:bg-card/10"
									key={row.name}
								>
									<th
										className="px-4 py-3 text-left font-normal text-muted-foreground text-sm sm:px-5 lg:px-6"
										scope="row"
									>
										{row.name}
									</th>
									{plans.map((plan) => (
										<td className={cellClass(plan.id)} key={plan.id}>
											{row.value(plan)}
										</td>
									))}
								</tr>
							))}
							<GatedFeaturePricingRows
								plans={plans}
								planTdClassName={cellClass}
							/>
							{["SSO (SAML/OIDC)", "Audit logs", "Guided onboarding"].map(
								(name) => (
									<tr
										className="border-border border-t transition-colors duration-150 hover:bg-card/10"
										key={name}
									>
										<th
											className="px-4 py-3 text-left font-normal text-muted-foreground text-sm sm:px-5 lg:px-6"
											scope="row"
										>
											{name}
										</th>
										{plans.map((plan) => (
											<td className={cellClass(plan.id)} key={plan.id}>
												{plan.id === "enterprise" ? "Included" : "—"}
											</td>
										))}
									</tr>
								)
							)}
							<tr className="border-border border-t">
								<td className="px-4 py-3 sm:px-5 lg:px-6" />
								{plans.map((plan) => {
									const topic = contactTopics[plan.id];
									return (
										<td className={cellClass(plan.id)} key={plan.id}>
											<SciFiButton
												asChild
												className="hover:animate-none hover:bg-foreground/10 focus-visible:bg-foreground/10 active:bg-foreground/15"
											>
												<Link
													aria-label={`${topic ? "Request access to" : plan.id === "enterprise" ? "Contact us about" : "Get started with"} ${plan.name}`}
													href={
														topic
															? `/contact?topic=${topic}`
															: plan.id === "enterprise"
																? "/contact"
																: `https://app.databuddy.cc/register?plan=${plan.id}`
													}
													onClick={() =>
														trackPricingPlanClick(
															plan.id,
															"pricing_comparison_table"
														)
													}
												>
													{topic
														? "REQUEST ACCESS"
														: plan.id === "enterprise"
															? "CONTACT US"
															: "GET STARTED"}
												</Link>
											</SciFiButton>
										</td>
									);
								})}
							</tr>
						</tbody>
					</table>
				</section>
			</SciFiCard>
			<p className="mt-3 text-pretty text-muted-foreground text-xs">
				Business and Scale are invite only. Extra investigations are billed
				monthly. Paid plans add tiered charges for extra events.{" "}
				<Link className="underline underline-offset-4" href="#event-rates">
					View usage rates
				</Link>
				.
			</p>
		</section>
	);
}
