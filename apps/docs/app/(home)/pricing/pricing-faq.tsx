import {
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import { FaqSection } from "@/components/landing/faq-section";

export const pricingFaqItems = [
	{
		question: "How many investigations are included?",
		answer: `Business includes ${INVESTIGATION_ALLOWANCES.intelligence} investigations per month; Scale includes ${INVESTIGATION_ALLOWANCES.intelligence_scale}. Extras cost $${INVESTIGATION_USAGE.priceUsd} each, billed monthly.`,
	},
	{
		question: "What is included in one investigation?",
		answer:
			"Only completed investigations count. Same-question clarifications and repair checks are included.",
	},
	{
		question: "What happens when I hit my event limit?",
		answer:
			"On Free, event ingestion pauses after 10,000 events for the month. Paid plans continue at tiered rates, subject to your billing limits.",
	},
	{
		question: "Is there a free trial?",
		answer:
			"The Free plan has no trial period and requires no credit card. It includes 10,000 events per month and 10 AI credits for Databunny chat. Monthly investigations are available on the invite-only Business and Scale plans.",
	},
	{
		question: "Can I switch plans?",
		answer:
			"Self-serve upgrades take effect immediately; downgrades start next billing cycle. Contact us for Business, Scale, or Enterprise access.",
	},
	{
		question: "Do you offer annual billing?",
		answer: "Plans are billed monthly. You can cancel at any time.",
	},
	{
		question: "What counts as an event?",
		answer:
			"A page view, a custom event, an error, or a Web Vitals measurement each count as one event. Feature flag evaluations do not count toward your event quota.",
	},
	{
		question: "What payment methods do you accept?",
		answer:
			"We accept all major credit and debit cards via Stripe. All payments are processed securely - we never see or store your card details.",
	},
	{
		question: "Can I self-host instead?",
		answer:
			"Yes. Databuddy is fully open source. You can self-host the entire stack on your own infrastructure at no cost. The cloud plans are for teams who want a managed experience without the ops overhead.",
	},
];

export function PricingFaq() {
	return (
		<div className="py-16 lg:py-24">
			<FaqSection items={pricingFaqItems} title="Pricing FAQ" />
		</div>
	);
}
