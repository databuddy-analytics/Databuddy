import { CheckIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";

import { SciFiCard } from "@/components/scifi-card";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Thanks for Reaching Out | Databuddy",
	description: "We've received your message and will get back to you soon.",
	alternates: {
		canonical: "https://www.databuddy.cc/contact/thanks",
	},
	robots: { index: false, follow: false },
};

export default function ContactThanksPage() {
	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title: "Thanks for Reaching Out | Databuddy",
					description:
						"We've received your message and will get back to you soon.",
					url: "https://www.databuddy.cc/contact/thanks",
				}}
			/>
			<Section className="overflow-hidden" id="contact-thanks">
				<div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl items-center justify-center px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-0">
					<SciFiCard
						className="mx-auto max-w-md rounded border border-green-500/50 bg-green-500/5 p-8 backdrop-blur-sm"
						cornerColor="bg-green-500"
					>
						<div className="text-center">
							<CheckIcon
								className="mx-auto mb-4 size-12 text-green-500"
								weight="duotone"
							/>
							<h1 className="mb-2 font-semibold text-foreground text-xl sm:text-2xl">
								Message Sent!
							</h1>
							<p className="mb-6 text-muted-foreground text-sm">
								Thanks for reaching out. We'll get back to you as soon as
								possible.
							</p>
							<SciFiButton asChild>
								<Link href="/">Back to Home</Link>
							</SciFiButton>
						</div>
					</SciFiCard>
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
