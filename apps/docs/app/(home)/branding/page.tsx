import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { StructuredData } from "@/components/structured-data";
import BrandingContent from "./branding-content";

export const metadata: Metadata = {
	title: "Brand Guidelines | Databuddy",
	description:
		"Databuddy brand assets, logo usage guidelines, color palette, and typography. Download official logos, wordmarks, and graphic assets.",
	alternates: {
		canonical: "https://www.databuddy.cc/branding",
	},
	openGraph: {
		title: "Brand Guidelines | Databuddy",
		description:
			"Databuddy brand assets, logo usage guidelines, color palette, and typography.",
		url: "https://www.databuddy.cc/branding",
		images: ["/og-image.png"],
	},
};

export default function BrandingPage() {
	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title: "Brand Guidelines | Databuddy",
					description:
						"Databuddy brand assets, logo usage guidelines, color palette, and typography.",
					url: "https://www.databuddy.cc/branding",
				}}
			/>

			<BrandingContent />

			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
			</div>

			<Footer />

			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
			</div>
		</div>
	);
}
