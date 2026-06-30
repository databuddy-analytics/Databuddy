import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import Section from "@/components/landing/section";

import { StructuredData } from "@/components/structured-data";
import CareersHero from "./careers-hero";
import CareersPaths from "./careers-paths";
import CareersPrinciples from "./careers-principles";

const title = "Careers | Databuddy";
const description =
	"We're a small, remote team building privacy-first analytics in the open. No formal openings most of the time, but we always want to hear from sharp builders.";
const url = "https://www.databuddy.cc/careers";

export const metadata: Metadata = {
	title,
	description,
	alternates: {
		canonical: url,
	},
	openGraph: {
		title,
		description,
		url,
		images: ["/og-image.png"],
	},
};

export default function CareersPage() {
	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title,
					description,
					url,
				}}
			/>
			<Section className="overflow-hidden" id="careers-hero">
				<CareersHero />
			</Section>

			<Section
				className="border-border border-t bg-background/30"
				id="careers-paths"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<CareersPaths />
				</div>
			</Section>

			<Section
				className="border-border border-t border-b bg-background/50"
				id="careers-principles"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<CareersPrinciples />
				</div>
			</Section>

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
