import type { Metadata } from "next";
import { SITE_URL } from "@/app/util/constants";
import { Footer } from "@/components/footer";
import {
	calculateCookieBannerCost,
	DEFAULT_INPUTS,
	formatCurrencyFull,
	readCalculatorInputs,
} from "./_components/calculator-engine";
import { CalculatorSection } from "./_components/calculator-section";
import { CalculatorSources } from "./_components/calculator-sources";
import { CtaSection } from "./_components/cta-section";

const TITLE = "Analytics Measurement Gap Calculator";
const DESCRIPTION =
	"Estimate how missing visits affect revenue attribution. Adjust traffic, measurement coverage, conversion rate, and order value using your own assumptions.";

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
	searchParams,
}: PageProps): Promise<Metadata> {
	const params = await searchParams;
	const inputs = readCalculatorInputs(params);
	const selected = inputs ?? DEFAULT_INPUTS;
	const result = calculateCookieBannerCost(selected);
	const ogParams = new URLSearchParams({
		revenue: String(result.lostRevenueYearly),
		visitors: String(selected.monthlyVisitors),
	});
	const ogImageUrl = `${SITE_URL}/calculator/og?${ogParams}`;
	const personalizedDescription = inputs
		? `Estimated unattributed revenue: ${formatCurrencyFull(result.lostRevenueYearly)}/year. Explore the supplied assumptions in this measurement model.`
		: DESCRIPTION;

	return {
		title: TITLE,
		alternates: { canonical: "/calculator" },
		description: personalizedDescription,
		openGraph: {
			title: TITLE,
			description: personalizedDescription,
			url: `${SITE_URL}/calculator`,
			images: [
				{
					url: ogImageUrl,
					width: 1200,
					height: 630,
					alt: "Analytics Measurement Gap Calculator results",
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: TITLE,
			description: personalizedDescription,
			images: [ogImageUrl],
		},
	};
}

export default async function CalculatorPage({ searchParams }: PageProps) {
	const initialInputs =
		readCalculatorInputs(await searchParams) ?? DEFAULT_INPUTS;
	return (
		<>
			<div className="px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pt-32">
				<div className="mx-auto w-full max-w-7xl">
					<header className="mb-12 text-center sm:mb-16">
						<p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-widest">
							Free Tool
						</p>
						<h1 className="mb-3 text-balance font-bold text-3xl tracking-tight sm:text-4xl lg:text-5xl">
							Analytics Measurement Gap Calculator
						</h1>
						<p className="mx-auto max-w-2xl text-balance text-pretty text-muted-foreground text-sm sm:text-base">
							Estimate the revenue associated with visits missing from your
							analytics. Adjust the assumptions to explore your measurement gap.
						</p>
					</header>

					<div className="space-y-16 sm:space-y-24">
						<CalculatorSection
							initialInputs={initialInputs}
							key={JSON.stringify(initialInputs)}
						/>
						<CtaSection />
						<CalculatorSources />
					</div>
				</div>
			</div>

			<Footer />
		</>
	);
}
