import type { Metadata } from "next";
import { headers } from "next/headers";
import Bento from "@/components/bento";
import { Footer } from "@/components/footer";
import { DemoPreconnectLinks } from "@/components/landing/demo-preconnect-links";
import { Description } from "@/components/landing/description";
import FAQ from "@/components/landing/faq";
import { GridCards } from "@/components/landing/grid-cards";
import Hero from "@/components/landing/hero";
import Section from "@/components/landing/section";
import Testimonials from "@/components/landing/testimonials";
import { TrustedBy } from "@/components/landing/trusted-by";
import { StructuredData } from "@/components/structured-data";
import { getDemoEmbedBaseUrl, hostFromNextHeaders } from "@/lib/demo-embed-url";
import { homeFaqItems, homePageSeo } from "@/lib/home-seo";

export const metadata: Metadata = {
	title: homePageSeo.title,
	description: homePageSeo.description,
	alternates: {
		canonical: homePageSeo.url,
	},
	openGraph: {
		title: homePageSeo.title,
		description: homePageSeo.description,
		url: homePageSeo.url,
	},
};

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default async function HomePage() {
	const headerList = await headers();
	const demoEmbedBaseUrl = getDemoEmbedBaseUrl(hostFromNextHeaders(headerList));

	return (
		<>
			<DemoPreconnectLinks />
			<StructuredData
				elements={[
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
					<Hero demoEmbedBaseUrl={demoEmbedBaseUrl} />
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
						<Bento />
					</div>
				</Section>

				<Section className="border-border border-b py-16 lg:py-24" id="cards">
					<div className={container}>
						<GridCards />
					</div>
				</Section>

				<Section
					className="border-border border-b bg-background/30"
					customPaddings
					id="desc-border"
				>
					<div className={container}>
						<Section className="pt-8 lg:pt-12" customPaddings id="description">
							<Description />
						</Section>

						<div className="w-full">
							<div className="h-px bg-linear-to-r from-transparent via-border to-transparent" />
						</div>

						<Section className="py-16 lg:py-20" customPaddings id="faq">
							<FAQ />
						</Section>
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
