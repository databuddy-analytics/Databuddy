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
		"alternative",
		data
	);
	const pageUrl = `${SITE_URL}/alternatives/${slug}`;

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

export default async function AlternativeToPage({ params }: PageProps) {
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
		"alternative",
		data
	);
	const pageUrl = `${SITE_URL}/alternatives/${slug}`;
	const introText = getProgrammaticIntroText("alternative", data);

	return (
		<ComparisonPageView
			breadcrumbTrail={[
				{ name: "Home", url: `${SITE_URL}/` },
				{ name: "Alternatives", url: `${SITE_URL}/alternatives` },
				{
					name: competitor.name,
					url: pageUrl,
				},
			]}
			competitor={competitor}
			faqs={faqs}
			featureSectionSubtitle={`Databuddy vs ${competitor.name} — same comparison as our main review, tuned for “alternative to ${competitor.name}” searches`}
			features={features}
			featuresWin={featuresWin}
			heroCta={hero.cta}
			heroDescription={hero.description}
			heroHeading={
				<>
					Alternative to{" "}
					<span className="text-muted-foreground">{competitor.name}</span>
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
