import type { Metadata } from "next";
import { SITE_URL } from "@/app/util/constants";
import { Footer } from "@/components/footer";
import { CalculatorSection } from "./_components/calculator-section";
import { CalculatorSources } from "./_components/calculator-sources";
import { CtaSection } from "./_components/cta-section";
import { ScenariosSection } from "./_components/scenarios-section";

const TITLE = "Cookie Banner Cost Calculator";
const DESCRIPTION =
	"Model unattributed revenue from the cookie-consent measurement gap: traffic, visitor-to-paid, revenue per conversion, and a 40–70% band. Not P&L impact.";

/** Matches defaults: 50k visitors, 55% data loss, 1.5% visitor-to-paid, $50 - ~$248k/yr; ~$11/mo Databuddy at this volume */
const DEFAULT_OG_PARAMS = "revenue=247500&visitors=50000&cost=11";

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
	searchParams,
}: PageProps): Promise<Metadata> {
	const params = await searchParams;
	const revenue = typeof params.revenue === "string" ? params.revenue : null;
	const visitors = typeof params.visitors === "string" ? params.visitors : null;
	const cost = typeof params.cost === "string" ? params.cost : null;

	const hasPersonalizedParams = revenue && visitors && cost;

	const ogParams = hasPersonalizedParams
		? `revenue=${revenue}&visitors=${visitors}&cost=${cost}`
		: DEFAULT_OG_PARAMS;

	const ogImageUrl = `${SITE_URL}/calculator/og?${ogParams}`;

	const personalizedDescription = hasPersonalizedParams
		? `Modeled unattributed revenue ~$${Number(revenue).toLocaleString()}/year (measurement gap) vs Databuddy ~$${Number(cost).toLocaleString()}/month - not literal loss.`
		: DESCRIPTION;

	return {
		title: TITLE,
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
					alt: "Cookie Banner Cost Calculator results",
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

export default function CalculatorPage() {
	return (
		<>
		<div className="px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pt-32">
			<div className="mx-auto w-full max-w-7xl">
				<header className="mb-12 text-center sm:mb-16">
					<p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-widest">
						Free Tool
					</p>
					<h1 className="mb-3 text-balance font-bold text-3xl tracking-tight sm:text-4xl lg:text-5xl">
						Cookie Banner Cost Calculator
					</h1>
					<p className="mx-auto max-w-2xl text-balance text-pretty text-muted-foreground text-sm sm:text-base">
						Without consent, visits often do not show up in cookie-based
						analytics - a measurement gap, not people abandoning your site. The
						model estimates unattributed revenue if conversions scale with
						traffic the same way across measured and unmeasured visits (default
						55% unmeasured; 40–70% band on the yearly figure). Popular scripts
						can still be blocked: think cookie + consent + adblock vs cookieless
						+ adblock, not recovering every dollar.
					</p>
				</header>

				<div className="space-y-16 sm:space-y-24">
					<CalculatorSection />
					<ScenariosSection />
					<CtaSection />
					<CalculatorSources />
				</div>
			</div>
		</div>

		<Footer />
		</>
	);
}
