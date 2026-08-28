import { CheckIcon } from "@databuddy/ui/icons";
import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import { trackPricingPlanClick } from "./track-pricing";

const INTELLIGENCE_TIERS = [
	{
		id: "intelligence",
		name: "Business",
		price: "$299",
		description:
			"An always-on product investigator for founders and engineers.",
		features: [
			"1,500 investigation credits / month",
			"2,000,000 events included / month",
			"Scheduled investigations across all your sites",
			"Unlimited funnels, goals, and feature flags",
			"Tiered event overage",
		],
	},
	{
		id: "intelligence_scale",
		name: "Data Team",
		price: "$799",
		description:
			"More investigation capacity for products with higher traffic and faster release cycles.",
		features: [
			"5,000 investigation credits / month",
			"10,000,000 events included / month",
			"Scheduled investigations across all your sites",
			"Unlimited funnels, goals, and feature flags",
			"Tiered event overage",
		],
	},
] as const;

export function IntelligenceSection() {
	return (
		<section className="mb-10">
			<div className="mb-6">
				<h2 className="font-semibold text-2xl tracking-tight">
					Intelligence plans
				</h2>
				<p className="mt-1 max-w-2xl text-muted-foreground text-sm sm:text-base">
					Always-on Databunny capacity for teams that want investigations
					running continuously. Sized by investigation credits, not just event
					volume.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{INTELLIGENCE_TIERS.map((tier) => (
					<div
						className="group relative flex flex-col border border-border bg-card/70 p-6 shadow-inner backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:shadow-primary/10"
						key={tier.id}
					>
						<div className="flex items-baseline justify-between gap-2">
							<h3 className="font-semibold text-lg">{tier.name}</h3>
							<p className="font-semibold text-2xl tracking-tight">
								{tier.price}
								<span className="ml-1 font-normal text-muted-foreground text-sm">
									/ month
								</span>
							</p>
						</div>
						<p className="mt-1 text-muted-foreground text-sm">
							{tier.description}
						</p>
						<ul className="mt-4 flex-1 space-y-2">
							{tier.features.map((feature) => (
								<li
									className="flex items-start gap-2 text-foreground text-sm"
									key={feature}
								>
									<CheckIcon
										className="mt-0.5 size-4 shrink-0 text-primary"
										weight="bold"
									/>
									{feature}
								</li>
							))}
						</ul>
						<div className="mt-6">
							<SciFiButton asChild>
								<Link
									href={`https://app.databuddy.cc/register?plan=${tier.id}`}
									onClick={() =>
										trackPricingPlanClick(tier.id, "pricing_intelligence")
									}
									rel="noopener noreferrer"
									target="_blank"
								>
									GET STARTED
								</Link>
							</SciFiButton>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
