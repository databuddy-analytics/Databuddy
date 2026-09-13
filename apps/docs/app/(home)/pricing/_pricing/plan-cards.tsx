import {
	INTELLIGENCE_CONTACT_TOPICS,
	INTELLIGENCE_PLAN_IDS,
} from "@databuddy/shared/types/features";
import { ArrowRightIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { formatMoney } from "./estimator-utils";
import { trackPricingPlanClick } from "./track-pricing";
import type { NormalizedPlan } from "./types";

export function PlanCards({ plans }: { plans: NormalizedPlan[] }) {
	return (
		<section
			aria-label="Plans"
			className="mb-10 motion-reduce:[&_*]:animate-none! motion-reduce:[&_*]:transition-none!"
		>
			<div className="grid gap-4 md:grid-cols-3">
				{plans
					.filter((plan) => ["hobby", "pro", "intelligence"].includes(plan.id))
					.map((plan, index) => (
						<article
							className="motion-safe:fade-in-75 motion-safe:slide-in-from-bottom-2 motion-safe:animation-duration-150 flex flex-col border border-border bg-card/70 p-6 transition-transform duration-150 ease-out focus-within:bg-card focus-within:shadow-lg hover:bg-card hover:shadow-lg motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:hover:-translate-y-1 motion-safe:focus-within:-translate-y-1"
							id={plan.id}
							key={plan.id}
							style={{ animationDelay: `${index * 40}ms` }}
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
							<SciFiButton
								asChild
								className="w-full transition-opacity duration-150 hover:animate-none hover:bg-foreground/10 focus-visible:bg-foreground/10 active:scale-100 active:bg-foreground/15 active:opacity-80"
							>
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
							className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm focus-within:bg-card/70 hover:bg-card/70"
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
								className="group/plan-link inline-flex shrink-0 items-center gap-2 rounded-sm underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background active:text-muted-foreground"
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
								<ArrowRightIcon
									aria-hidden="true"
									className="size-3.5 transition-transform duration-150 motion-safe:group-focus-visible/plan-link:translate-x-0.5 motion-safe:group-hover/plan-link:translate-x-0.5"
								/>
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
