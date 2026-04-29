import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/app/util/constants";
import { ComparisonPageView } from "@/components/compare/comparison-page-view";
import {
	getAllCompetitorSlugs,
	getComparisonData,
} from "@/lib/comparison-config";
import {
	getProgrammaticComparisonSeo,
	getProgrammaticIntroText,
} from "@/lib/programmatic-comparison-seo";

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
		return { title: "Not Found | Databuddy" };
	}

	const { title, description } = getProgrammaticComparisonSeo(
		"switch-from",
		data
	);
	const pageUrl = `${SITE_URL}/switch-from/${slug}`;

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			url: pageUrl,
		},
		alternates: { canonical: pageUrl },
	};
}

export default async function SwitchFromPage({ params }: PageProps) {
	const { slug } = await params;
	const data = getComparisonData(slug);

	if (!data) {
		notFound();
	}

	const { competitor, features, hero, faqs, pricingTiers, migrationSection } =
		data;
	const featuresWin = features.filter(
		(f) => f.databuddy && !f.competitor
	).length;

	const { title, description } = getProgrammaticComparisonSeo(
		"switch-from",
		data
	);
	const pageUrl = `${SITE_URL}/switch-from/${slug}`;
	const introText = getProgrammaticIntroText("switch-from", data);

	return (
		<ComparisonPageView
			competitor={competitor}
			faqs={faqs}
			featureSectionSubtitle={`Leaving ${competitor.name}? Feature and pricing comparison before you switch to Databuddy`}
			features={features}
			featuresWin={featuresWin}
			heroDescription={hero.description}
			heroHeading={
				<>
					Switch from{" "}
					<span className="text-muted-foreground">{competitor.name}</span>{" "}
					<span className="text-muted-foreground">to</span> Databuddy
				</>
			}
			introText={introText}
			migrationSection={migrationSection}
			pageUrl={pageUrl}
			pricingTiers={pricingTiers}
			structuredDescription={description}
			structuredTitle={title}
		/>
	);
}
