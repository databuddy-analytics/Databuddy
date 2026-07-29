import type { Metadata } from "next";
import { IntelligenceComingSoon } from "../_components/intelligence-coming-soon";
import { intelligenceComingSoonPages } from "@/components/layout/navigation/intelligence-navigation-config";

const page = intelligenceComingSoonPages["product-intelligence"];

export const metadata: Metadata = {
	title: page.title,
	description: page.description,
};

export default function ProductIntelligencePage() {
	return (
		<IntelligenceComingSoon
			description={page.description}
			icon={page.icon}
			title={page.title}
		/>
	);
}
