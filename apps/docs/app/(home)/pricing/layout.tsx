import type { Metadata } from "next";
import { StructuredData } from "@/components/structured-data";
import { RAW_PLANS } from "./data";
import { pricingFaqItems } from "./pricing-faq";

const pricingTitle = "Pricing — Analytics, Chat, and Investigations";
const pricingDescription =
	"Start free with 10,000 events and 10 AI credits for Databunny chat. Business includes 100 investigations per month; Scale includes 500, with $1 per extra.";
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
