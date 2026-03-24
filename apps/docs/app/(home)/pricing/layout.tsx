import type { Metadata } from "next";
import { StructuredData } from "@/components/structured-data";
import { RAW_PLANS } from "./data";

const pricingTitle = "Pricing — Free Tier, Fair Overage, Scale to 100M Events";
const pricingDescription =
	"Simple, transparent pricing for privacy-first analytics. Start free with 10,000 events per month, then pay only for what you use with tiered overage.";
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
