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

async function getGithubStars(): Promise<number | null> {
	try {
		const response = await fetch(
			"https://api.github.com/repos/databuddy-analytics/databuddy",
			{
				headers: { Accept: "application/vnd.github+json" },
				next: { revalidate: 3600 },
			}
		);
		if (!response.ok) {
			return null;
		}
		const data = (await response.json()) as { stargazers_count?: number };
		return typeof data.stargazers_count === "number"
			? data.stargazers_count
			: null;
	} catch {
		return null;
	}
}

export default async function HomePage() {
	const [headerList, stars] = await Promise.all([headers(), getGithubStars()]);
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
					<Hero demoEmbedBaseUrl={demoEmbedBaseUrl} stars={stars} />
				</Section>

				<Section
					className="border-border border-t border-b bg-background/50 py-8 sm:py-10 lg:py-12"
					customPaddings
					id="trust"
				>
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<TrustedBy />
					</div>
				</Section>

				<Section className="border-border border-b" id="bento">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<Bento />
					</div>
				</Section>

				<Section className="border-border border-b py-16 lg:py-24" id="cards">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<GridCards />
					</div>
				</Section>

				<Section
					className="border-border border-b bg-background/30"
					customPaddings
					id="desc-border"
				>
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<Section className="pt-8 lg:pt-12" customPaddings id="description">
							<Description />
						</Section>

						<div className="mx-auto w-full">
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
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
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
