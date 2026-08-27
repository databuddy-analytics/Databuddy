import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { TrackOnMount } from "@/components/track-on-mount";
import { CELL_TITLE_CLASS } from "@/components/landing/demo-constants";
import {
	FeatureHero,
	GridCell,
	SectionHeader,
	TwoColumnGrid,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import { MidPageCta } from "@/components/landing/mid-page-cta";
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
		"Short links with built-in click analytics, UTM tagging, QR codes, deep linking, and referrer tracking. Every click tracked inside your analytics dashboard.",
	alternates: {
		canonical: "https://www.databuddy.cc/links",
	},
	openGraph: {
		title: "Short Links & Click Analytics",
		description:
			"Short links with built-in click analytics, UTM tagging, QR codes, deep linking, and referrer tracking. Every click tracked inside your analytics dashboard.",
		url: "https://www.databuddy.cc/links",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "How is this different from Bitly or Dub?",
		answer:
			"Databuddy links live inside your analytics stack. Every click is connected to the same dashboard where you track pageviews, errors, and conversions. No separate tool, no data silos.",
	},
	{
		question: "Are click counts accurate?",
		answer:
			"Yes. Bots and crawlers are detected and redirected without counting, so your numbers reflect real people. Visitor IPs are hashed with a rotating daily salt and never stored raw.",
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
		question: "Can I manage links from the API?",
		answer:
			"Yes. Create, update, and search links with a scoped API key, or let your AI agent do it over MCP. Folders keep campaigns organized either way.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function LinksPage() {
	return (
		<>
			<TrackOnMount
				event="feature_landing_viewed"
				properties={{ feature: "links" }}
			/>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Short Links & Click Analytics",
					description:
						"Short links with built-in click analytics, UTM tagging, QR codes, and deep linking.",
					url: "https://www.databuddy.cc/links",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs/api/links"
					primaryLabel="Create Your First Link"
					subtitle="Click analytics, UTM tagging, deep linking, and QR codes, with every click in the same dashboard as your pageviews, errors, and conversions."
					title="Short links in the dashboard you already use."
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
									See which links drive traffic.
								</h3>
								<LinksTableDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Know where your clicks come from.
								</h3>
								<ReferrerBreakdownDemo />
							</GridCell>
						</TwoColumnGrid>
						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Connect link clicks to your funnels.
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
							subtitle="UTM tagging, expiration dates, QR codes, and per-link social previews. Bots are filtered from your counts, and IPs are hashed, never stored."
							title="Clean links,"
							titleMuted="honest numbers."
						/>
						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Build UTM-tagged destinations behind clean short links.
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
						<FaqSection items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Section className="border-border border-b" id="cta">
					<div className={container}>
						<MidPageCta />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
