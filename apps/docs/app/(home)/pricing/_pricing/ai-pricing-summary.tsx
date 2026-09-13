import {
	DATABUNNY_USAGE,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import type { RawPlan } from "../data";
import { formatTierRate } from "./estimator-utils";

function buildPlanSummary(plan: RawPlan): string {
	const lines: string[] = [];

	const priceItem = plan.items.find((i) => i.type === "price");
	if (priceItem && priceItem.type === "price") {
		lines.push(`Base price: $${priceItem.price}/month`);
	} else if (plan.id === "free") {
		lines.push("Base price: $0/month (free)");
	} else if (plan.id === "enterprise") {
		lines.push("Base price: Custom (contact sales)");
	}

	for (const item of plan.items) {
		if (item.type === "feature") {
			const qty =
				item.included_usage === "inf"
					? "unlimited"
					: item.included_usage.toLocaleString();
			const per = item.interval ? ` per ${item.interval}` : "";
			lines.push(`${item.feature.name}: ${qty} included${per}`);
		}

		if (item.type === "priced_feature") {
			const qty =
				item.included_usage === "inf"
					? "unlimited"
					: item.included_usage.toLocaleString();
			const per = item.interval ? ` per ${item.interval}` : "";
			lines.push(`${item.feature.name}: ${qty} included${per}`);
			if (typeof item.price === "number") {
				lines.push(
					`Additional ${item.feature.display.plural}: $${item.price} per ${item.feature.display.singular}, billed monthly`
				);
			}

			if (item.tiers?.length && item.included_usage !== "inf") {
				lines.push("Overage tiers (total monthly event counts):");
				let prevTo = item.included_usage;
				for (const tier of item.tiers) {
					const from = (prevTo + 1).toLocaleString();
					const to = tier.to === "inf" ? "unlimited" : tier.to.toLocaleString();
					lines.push(
						`  ${from}–${to}: ${formatTierRate(tier.amount)} per 1,000 events`
					);
					if (tier.to !== "inf") {
						prevTo = tier.to;
					}
				}
			}
		}
	}

	return lines.join("\n");
}

export function AiPricingSummary({ plans }: { plans: RawPlan[] }) {
	const summary = plans
		.map((plan) => `## ${plan.name} Plan\n${buildPlanSummary(plan)}`)
		.join("\n\n");

	const full = [
		"# Databuddy Pricing",
		"Currency: USD. Base plans and additional investigation usage are billed monthly.",
		"Machine-readable version: https://www.databuddy.cc/api/pricing",
		"",
		INVESTIGATION_USAGE.description,
		"Business and Scale include monthly investigation allowances. Existing prepaid investigation balances retain their original terms.",
		DATABUNNY_USAGE.description,
		summary,
		"",
		"Sign up: https://app.databuddy.cc/register",
	].join("\n");

	return (
		<section
			aria-label="Databuddy pricing summary for AI agents and screen readers"
			className="sr-only"
			data-ai-pricing
		>
			<pre>{full}</pre>
		</section>
	);
}
