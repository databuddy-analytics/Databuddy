import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { CELL_TITLE_CLASS } from "@/components/landing/demo-constants";
import {
	FeatureHero,
	GridCell,
	SectionHeader,
	TwoColumnGrid,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import {
	DeepLinkDemo,
	LinkFunnelDemo,
	LinksTableDemo,
	ReferrerBreakdownDemo,
	UtmBuilderDemo,
} from "@/components/landing/links-demo-visuals";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Short Links & Click Analytics",
	description:
		"Create branded short links with built-in click analytics, UTM tagging, QR codes, deep linking, and referrer tracking. Every click tracked inside your analytics dashboard.",
	alternates: {
		canonical: "https://www.databuddy.cc/links",
	},
	openGraph: {
		title: "Short Links & Click Analytics",
		description:
			"Create branded short links with built-in click analytics, UTM tagging, QR codes, deep linking, and referrer tracking. Every click tracked inside your analytics dashboard.",
		url: "https://www.databuddy.cc/links",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "Can I use my own domain for short links?",
		answer:
			"Yes. You can connect any custom domain and use it as your link base. All analytics still flow into your Databuddy dashboard.",
	},
	{
		question: "How is this different from Bitly or Dub?",
		answer:
			"Databuddy links live inside your analytics stack. Every click is connected to the same dashboard where you track pageviews, errors, and conversions. No separate tool, no data silos.",
	},
	{
		question: "Do links expire?",
		answer:
			"Optionally. You can set an expiration date and a redirect URL for expired links. Links without an expiration last forever.",
	},
	{
		question: "How do deep links work?",
		answer:
			"Set an iOS URL and an Android URL on any link. When someone clicks on mobile, they go to the right app store or deep into your native app. Desktop users get the web fallback automatically.",
	},
	{
		question: "Are short links included in all plans?",
		answer:
			"Every plan includes short links. The free plan gives you 50 links. Paid plans scale from there with unlimited links and custom domains.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function LinksPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Short Links & Click Analytics",
					description:
						"Create branded short links with built-in click analytics, UTM tagging, QR codes, and deep linking.",
					url: "https://www.databuddy.cc/links",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs"
					subtitle="Branded short links with click analytics, UTM tagging, deep linking, and referrer tracking. Every click lands in your existing dashboard."
					title="Short links that feed your analytics."
				/>

				<Section className="border-border border-b" id="tracking">
					<div className={container}>
						<SectionHeader
							subtitle="Every click captured with referrer, device, location, and timestamp. No extra setup, no third-party tool."
							title="Every click,"
							titleMuted="full context."
						/>
						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									See which links drive traffic and which ones don't.
								</h3>
								<LinksTableDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Know exactly where your clicks come from.
								</h3>
								<ReferrerBreakdownDemo />
							</GridCell>
						</TwoColumnGrid>
						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Track the full journey from click to conversion.
								</h3>
								<LinkFunnelDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Paste a link, open the native app.
								</h3>
								<DeepLinkDemo />
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="tools">
					<div className={container}>
						<SectionHeader
							subtitle="UTM parameters, expiration dates, QR codes, and custom domains. Built into every link."
							title="More than"
							titleMuted="a URL shortener."
						/>
						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Tag every link with UTM parameters automatically.
								</h3>
								<UtmBuilderDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Set expiration dates and custom redirect URLs.
								</h3>
								<div className="space-y-2">
									<div className="rounded border border-border/30 bg-card/50 px-3 py-2.5">
										<div className="font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
											Expires
										</div>
										<div className="font-mono text-foreground text-xs">
											June 30, 2026 at 11:59 PM
										</div>
									</div>
									<div className="rounded border border-border/30 bg-card/50 px-3 py-2.5">
										<div className="font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
											After expiry, redirect to
										</div>
										<div className="font-mono text-foreground text-xs">
											yourapp.com/offer-ended
										</div>
									</div>
								</div>
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="faq">
					<div className={container}>
						<FaqSection eyebrow="FAQ" items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
