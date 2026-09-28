import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { FeatureHero, FeatureRow } from "@/components/landing/demo-primitives";
import { SECTION_SPACING } from "@/components/landing/demo-constants";
import { FaqSection } from "@/components/landing/faq-section";
import {
	BotCount,
	ClickSources,
	DeviceRoutes,
	RepointQr,
	UtmTags,
} from "@/components/landing/links-demo-visuals";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { cn } from "@/lib/utils";
import { TrackOnMount } from "@/components/track-on-mount";

const TITLE = "Short Links With Click Analytics";
const DESCRIPTION =
	"Share one short link everywhere and see which post, email, or channel brings people in. Phones go to the right app store, and bots never count as clicks.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: {
		canonical: "https://www.databuddy.cc/links",
	},
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "https://www.databuddy.cc/links",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "Which domain do links use?",
		answer:
			"dby.sh, with a slug you choose or one we generate. Custom domains aren't available.",
	},
	{
		question: "Do clicks count toward my events?",
		answer:
			"No. Link clicks are stored on their own and don't use your monthly events.",
	},
	{
		question: "Can a link open the Instagram or TikTok app?",
		answer:
			"Yes. Links to Instagram, TikTok, YouTube, X, Spotify, LinkedIn, Facebook, WhatsApp, and Telegram open the app on phones, and fall back to the browser.",
	},
	{
		question: "Can a link stop working after a date?",
		answer: "Yes. Set an end date and the page people land on after it.",
	},
	{
		question: "Can I create links from code?",
		answer:
			"Yes, through the API with a key scoped to write:links, or with the create_link tool over MCP.",
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
					title: TITLE,
					description: DESCRIPTION,
					url: "https://www.databuddy.cc/links",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs/api/links"
					footnote="Included on every plan."
					primaryLabel="Create your first link"
					secondaryLabel="Read the docs"
					subtitle="Share one short link everywhere and see which post, email, or channel brings people in, right next to your site analytics."
					title="Know where every click came from."
					visual={<ClickSources />}
				/>

				<FeatureRow
					body="iPhone visitors go to the App Store, Android visitors to Google Play, and everyone else to your site."
					id="devices"
					title="One link gets every phone to the right app store."
					visual={<DeviceRoutes />}
				/>

				<FeatureRow
					body="Only people show up in your click counts, even after Slack and Discord load the link to build their previews."
					flip
					id="bots"
					title="Click counts you can trust."
					visual={<BotCount />}
				/>

				<FeatureRow
					body="Point the link somewhere new any time, and every QR code already printed follows it."
					id="qr"
					title="Never reprint a QR code."
					visual={<RepointQr />}
				/>

				<FeatureRow
					body="Add UTM tags as you create the link, and the visits it brings show up under that campaign in your analytics."
					flip
					id="utm"
					title="Credit every visit to the right campaign."
					visual={<UtmTags />}
				/>

				<Section
					className={cn("border-border border-b", SECTION_SPACING)}
					customPaddings
					id="faq"
				>
					<div className={container}>
						<FaqSection items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
