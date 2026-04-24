import { FaqSection } from "@/components/landing/faq-section";

export const pricingFaqItems = [
	{
		question: "What happens when I hit my event limit?",
		answer:
			"You won't lose any data. Events above your included quota are billed at tiered overage rates that get cheaper the more you send. You can monitor your usage in the dashboard and set alerts so there are no surprises.",
	},
	{
		question: "Is there a free trial?",
		answer:
			"The Free plan is forever free — no trial period, no credit card required. You get 10,000 events per month and 10 agent credits to explore the AI assistant. Upgrade any time if you need more, or buy credit top-ups as you go.",
	},
	{
		question: "Can I switch plans?",
		answer:
			"Yes, you can upgrade or downgrade at any time. When you upgrade, the new plan takes effect immediately. When you downgrade, the change takes effect at the start of your next billing cycle.",
	},
	{
		question: "Do you offer annual billing?",
		answer:
			"Not yet, but it's on the roadmap. Right now all plans are billed monthly with no long-term commitment. You can cancel at any time.",
	},
	{
		question: "What counts as an event?",
		answer:
			"A page view, a custom event, an error, or a Web Vitals measurement each count as one event. Feature flag evaluations do not count toward your event quota.",
	},
	{
		question: "What payment methods do you accept?",
		answer:
			"We accept all major credit and debit cards via Stripe. All payments are processed securely — we never see or store your card details.",
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
