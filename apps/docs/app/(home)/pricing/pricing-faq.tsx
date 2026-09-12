import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { FaqSection } from "@/components/landing/faq-section";

export const pricingFaqItems = [
	{
		question: "What is included in one investigation?",
		answer: INVESTIGATION_USAGE.description,
	},
	{
		question: "What happens to my existing credits?",
		answer:
			"Your existing credits and plan allowances are preserved. Existing subscriptions retain legacy investigation billing until you buy $1 investigations or switch to a new plan version. After opting in, AI credits continue to pay for ordinary chat; they are not converted into investigation units.",
	},
	{
		question: "What happens when I hit my event limit?",
		answer:
			"On Free, event ingestion pauses after 10,000 events for the month. Hobby and Pro continue with tiered event overage unless you set a hard billing limit. The dashboard shows current usage and lets you configure alerts and limits.",
	},
	{
		question: "Is there a free trial?",
		answer:
			"The Free plan has no trial period and requires no credit card. It includes 10,000 events and 10 AI credits per month for ordinary Databunny chat. Investigations are purchased separately at $1 each; scheduled investigations remain invite only.",
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
