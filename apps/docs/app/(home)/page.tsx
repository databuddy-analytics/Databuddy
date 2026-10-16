import { DATABUDDY_DESCRIPTION } from "@databuddy/shared/agent-discovery";
import type { Metadata } from "next";
import Bento from "@/components/bento";
import { Footer } from "@/components/footer";
import { AiSection } from "@/components/landing/ai-section";
import { DemoPreconnectLinks } from "@/components/landing/demo-preconnect-links";
import { FaqSection } from "@/components/landing/faq-section";
import { SectionBullet } from "@/components/icons/section-bullet";
import Hero from "@/components/landing/hero";
import { PricingPreview } from "@/components/landing/pricing-preview";
import Section from "@/components/landing/section";
import Testimonials from "@/components/landing/testimonials";
import { TrustedBy } from "@/components/landing/trusted-by";
import { StructuredData } from "@/components/structured-data";
import { homeFaqItems, homePageSeo } from "@/lib/home-seo";

export const metadata: Metadata = {
	title: { absolute: homePageSeo.title },
	description: homePageSeo.description,
	alternates: {
		canonical: homePageSeo.url,
	},
	openGraph: {
		title: homePageSeo.title,
		description: homePageSeo.description,
		url: homePageSeo.url,
		type: "website",
		images: ["/og-image.png"],
	},
};

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function HomePage() {
	return (
		<>
			<DemoPreconnectLinks />
			<StructuredData
				elements={[
					{
						type: "softwareApplication",
						value: {
							name: "Databuddy",
							description: DATABUDDY_DESCRIPTION,
							featureList: [
								"Cookieless product analytics",
								"Custom event tracking",
								"Funnels and goals",
								"User profiles",
								"Error tracking",
								"Core Web Vitals monitoring",
								"Uptime monitoring",
								"Feature flags",
								"Short links with click analytics",
								"Databunny AI analyst chat",
								"Scheduled investigations on Business and Scale",
								"REST API",
								"Model Context Protocol server",
							],
						},
					},
					{
						type: "faq",
						items: homeFaqItems,
					},
				]}
				page={{
					title: homePageSeo.title,
					description: homePageSeo.description,
					url: homePageSeo.url,
				}}
			/>
			<div className="overflow-hidden">
				<Section className="overflow-hidden" customPaddings id="hero">
					<Hero />
				</Section>

				<Section
					className="border-border border-t border-b"
					customPaddings
					id="trust"
				>
					<div className={container}>
						<TrustedBy />
					</div>
				</Section>

				<Section className="border-border border-b" id="bento">
					<div className={container}>
						<div className="mb-10 lg:mb-12">
							<h2 className="mx-auto flex max-w-4xl items-start gap-2 text-balance font-semibold text-2xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
								<span className="mt-1.5 hidden sm:block">
									<SectionBullet color="#483C7B" />
								</span>
								<span className="text-foreground">
									One dashboard for traffic, conversions, errors and speed.
								</span>
							</h2>
							<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
								Real-time visitors, sessions, funnels, custom events, error
								tracking, Web Vitals and feature flags all come from the same
								script, so you never need a second tool to see the whole
								picture.
							</p>
						</div>
						<Bento />
					</div>
				</Section>

				<Section className="border-border border-b py-16 lg:py-24" id="ai">
					<div className={container}>
						<AiSection />
					</div>
				</Section>

				<Section className="border-border border-b py-16 lg:py-24" id="pricing">
					<div className={container}>
						<PricingPreview />
					</div>
				</Section>

				<Section
					className="border-border border-b bg-background/30 py-16 lg:py-20"
					customPaddings
					id="faq"
				>
					<div className={container}>
						<FaqSection className="max-w-full" items={homeFaqItems} />
					</div>
				</Section>

				<Section
					className="bg-background/50 py-16 lg:py-24"
					customPaddings
					id="testimonial"
				>
					<div className={container}>
						<Testimonials />
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
		</>
	);
}
