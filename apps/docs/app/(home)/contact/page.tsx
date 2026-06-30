import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import Section from "@/components/landing/section";

import { StructuredData } from "@/components/structured-data";
import ContactForm from "./contact-form";
import ContactHero from "./contact-hero";

export const metadata: Metadata = {
	title: "Contact Us | Databuddy",
	description:
		"Get in touch with the Databuddy team. We'd love to hear from you.",
	alternates: {
		canonical: "https://www.databuddy.cc/contact",
	},
	openGraph: {
		title: "Contact Us | Databuddy",
		description:
			"Get in touch with the Databuddy team. We'd love to hear from you.",
		url: "https://www.databuddy.cc/contact",
		images: ["/og-image.png"],
	},
};

export default function ContactPage() {
	const title = "Contact Us | Databuddy";
	const description =
		"Get in touch with the Databuddy team. We'd love to hear from you.";
	const url = "https://www.databuddy.cc/contact";

	return (
		<div className="overflow-hidden">
			<StructuredData page={{ title, description, url }} />
			<Section className="overflow-hidden" id="contact">
				<div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-0">
					<div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-12">
						<div className="lg:col-span-3">
							<ContactHero />
						</div>
						<div className="lg:col-span-2">
							<ContactForm />
						</div>
					</div>
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
