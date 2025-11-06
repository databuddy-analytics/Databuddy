import type { Metadata } from "next";
import { StructuredData } from "@/components/structured-data";
import { RAW_PLANS } from "./data";

export const metadata: Metadata = {
	title: "Databuddy Pricing — Free tier, fair overage, scale to 100M events",
	description:
		"Simple, transparent pricing for privacy-first analytics. Start free with 10K events/month, then pay only for what you use with fair tiered overage.",
	alternates: {
		canonical: "https://www.databuddy.cc/pricing",
	},
	openGraph: {
		title: "Databuddy Pricing — Free tier, fair overage, scale to 100M events",
		description:
			"Simple, transparent pricing for privacy-first analytics. Start free with 10K events/month, then pay only for what you use with fair tiered overage.",
		url: "https://www.databuddy.cc/pricing",
		images: ["/og-image.png"],
	},
};

const title =
	"Databuddy Pricing — Free tier, fair overage, scale to 100M events";
const description =
	"Simple, transparent pricing for privacy-first analytics. Start free with 10K events/month, then pay only for what you use with fair tiered overage.";
const url = "https://www.databuddy.cc/pricing";

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
					title,
					description,
					url,
				}}
			/>
			{children}
		</>
	);
}
