import {
	INTELLIGENCE_CONTACT_TOPICS,
	INTELLIGENCE_PLAN_IDS,
} from "@databuddy/shared/types/features";
import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { formatMoney } from "./estimator-utils";
import { trackPricingPlanClick } from "./track-pricing";
import type { NormalizedPlan } from "./types";

export function PlanCards({ plans }: { plans: NormalizedPlan[] }) {
	return (
		<section aria-label="Plans" className="mb-10">
			<div className="grid gap-4 md:grid-cols-3">
				{plans
					.filter((plan) => ["hobby", "pro", "intelligence"].includes(plan.id))
					.map((plan) => (
						<article
							className="flex flex-col border border-border bg-card/70 p-6"
							id={plan.id}
							key={plan.id}
						>
							<h2 className="font-semibold text-lg">{plan.name}</h2>
							<p className="mt-3 font-semibold text-3xl tracking-tight">
								{formatMoney(plan.priceMonthly)}
								<span className="ml-1 font-normal text-muted-foreground text-sm">
									/ month
								</span>
							</p>
							<ul className="my-6 flex-1 space-y-3 text-sm">
								<li>
									{plan.includedEventsMonthly.toLocaleString()} events / month
								</li>
								{plan.chatIncluded && <li>Databunny chat included</li>}
								{plan.includedInvestigationsMonthly !== null && (
									<li>
										{plan.includedInvestigationsMonthly} investigations / month
										{plan.investigationPrice !== null && (
											<span className="mt-1 block text-muted-foreground">
												${plan.investigationPrice} per extra, billed monthly
											</span>
										)}
									</li>
								)}
								<li>
									{plan.id === "hobby"
										? "Email support"
										: plan.id === "pro"
											? "Priority email support"
											: "Priority email + Slack support"}
								</li>
							</ul>
							<SciFiButton asChild className="w-full">
								<Link
									href={
										plan.id === INTELLIGENCE_PLAN_IDS.ANALYST
											? `/contact?topic=${INTELLIGENCE_CONTACT_TOPICS[plan.id]}`
											: `https://app.databuddy.cc/register?plan=${plan.id}`
									}
									onClick={() =>
										trackPricingPlanClick(plan.id, "pricing_cards")
									}
								>
									{plan.id === INTELLIGENCE_PLAN_IDS.ANALYST
										? "REQUEST ACCESS"
										: "GET STARTED"}
								</Link>
							</SciFiButton>
						</article>
					))}
			</div>
			<div className="mt-4 divide-y divide-border border border-border">
				{plans
					.filter((plan) =>
						["free", "intelligence_scale", "enterprise"].includes(plan.id)
					)
					.map((plan) => (
						<div
							className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"
							id={plan.id}
							key={plan.id}
						>
							<div>
								<span className="font-semibold">
									{plan.name} ·{" "}
									{plan.id === "enterprise"
										? "Custom pricing"
										: `${formatMoney(plan.priceMonthly)} / month`}
								</span>
								<p className="mt-1 text-muted-foreground">
									{plan.id === "enterprise"
										? "Custom volume, security, and support"
										: `${plan.includedEventsMonthly.toLocaleString()} events / month${plan.chatIncluded ? " · Databunny chat included" : ""}${plan.includedInvestigationsMonthly === null ? "" : ` · ${plan.includedInvestigationsMonthly} investigations / month${plan.investigationPrice === null ? "" : ` · $${plan.investigationPrice} per extra`}`}`}
								</p>
							</div>
							<Link
								className="shrink-0 underline underline-offset-4"
								href={
									plan.id === INTELLIGENCE_PLAN_IDS.DATA_TEAM
										? `/contact?topic=${INTELLIGENCE_CONTACT_TOPICS[plan.id]}`
										: plan.id === "enterprise"
											? "/contact"
											: "https://app.databuddy.cc/register"
								}
								onClick={() => trackPricingPlanClick(plan.id, "pricing_cards")}
							>
								{plan.id === "free"
									? "Start free"
									: plan.id === "enterprise"
										? "Contact us"
										: "Request access"}
							</Link>
						</div>
					))}
			</div>
			<p className="mt-4 text-muted-foreground text-sm">
				Business and Scale are invite only. Only completed investigations count;
				same-question clarifications and repair verification are included.
			</p>
			<p className="mt-2 text-muted-foreground text-sm">
				Paid plans add tiered charges for extra events.{" "}
				<Link className="underline underline-offset-4" href="#event-rates">
					View usage rates
				</Link>
				.
			</p>
		</section>
	);
}
