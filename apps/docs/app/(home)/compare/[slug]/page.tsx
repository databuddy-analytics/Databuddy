import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/app/util/constants";
import { ComparisonPageView } from "@/components/compare/comparison-page-view";
import {
	comparisonsReviewedAt,
	getAllCompetitorSlugs,
	getComparisonData,
} from "@/lib/comparison-config";

interface PageProps {
	params: Promise<{
		slug: string;
	}>;
}

export function generateStaticParams() {
	return getAllCompetitorSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const data = getComparisonData(slug);

	if (!data) {
		return { title: "Comparison not found" };
	}

	const compareUrl = `${SITE_URL}/compare/${slug}`;

	return {
		title: { absolute: data.seo.title },
		description: data.seo.description,
		openGraph: {
			title: data.seo.title,
			description: data.seo.description,
			url: compareUrl,
			type: "website",
			images: ["/og-image.png"],
		},
		alternates: { canonical: compareUrl },
	};
}

export default async function ComparisonPage({ params }: PageProps) {
	const { slug } = await params;
	const data = getComparisonData(slug);

	if (!data) {
		notFound();
	}

	const { competitor, features, hero, seo, faqs, pricingTiers, verdict } = data;

	const pageUrl = `${SITE_URL}/compare/${slug}`;
	const titleParts = hero.title.split(" vs ");

	return (
		<ComparisonPageView
			breadcrumbs={[
				{ name: "Home", url: SITE_URL },
				{ name: "Compare", url: `${SITE_URL}/compare` },
				{ name: competitor.name, url: pageUrl },
			]}
			competitor={competitor}
			faqs={faqs}
			features={features}
			heroDescription={hero.description}
			heroHeading={
				<>
					{titleParts.at(0)} <span className="text-muted-foreground">vs</span>{" "}
					<span className="text-muted-foreground">{titleParts.at(1)}</span>
				</>
			}
			pageUrl={pageUrl}
			pricingTiers={pricingTiers}
			reviewedAt={comparisonsReviewedAt}
			sources={data.sources}
			structuredDescription={seo.description}
			structuredTitle={seo.title}
			verdict={verdict}
		/>
	);
}
