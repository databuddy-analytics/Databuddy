import {
	AGENT_CREDIT_ALLOWANCES,
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import type { Metadata } from "next";
import { StructuredData } from "@/components/structured-data";
import { RAW_PLANS } from "./data";
import { pricingFaqItems } from "./pricing-faq";

const pricingTitle = "Pricing: Analytics, Chat, and Investigations";
const pricingDescription = `Start free with 10,000 events and ${AGENT_CREDIT_ALLOWANCES.free.month} AI credits for Databunny chat. Business includes ${INVESTIGATION_ALLOWANCES.intelligence} investigations per month; Scale includes ${INVESTIGATION_ALLOWANCES.intelligence_scale}, with $${INVESTIGATION_USAGE.priceUsd} per extra.`;
const pricingUrl = "https://www.databuddy.cc/pricing";

export const metadata: Metadata = {
	title: pricingTitle,
	description: pricingDescription,
	alternates: {
		canonical: pricingUrl,
	},
	openGraph: {
		title: pricingTitle,
		description: pricingDescription,
		url: pricingUrl,
	},
};

export default function PricingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<>
			<StructuredData
				elements={[
					{
						type: "softwareOffers",
						name: "Databuddy Analytics Pricing",
						plans: RAW_PLANS,
					},
					{
						type: "faq",
						items: pricingFaqItems,
					},
				]}
				page={{
					title: pricingTitle,
					description: pricingDescription,
					url: pricingUrl,
				}}
			/>
			{children}
		</>
	);
}
