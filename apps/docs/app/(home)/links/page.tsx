import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import {
	FeatureHero,
	FeatureRow,
	FeatureSection,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import {
	BotCount,
	ClickSources,
	DeviceRoutes,
	RepointQr,
	UtmTags,
} from "@/components/landing/links-demo-visuals";
import { StructuredData } from "@/components/structured-data";
import { TrackOnMount } from "@/components/track-on-mount";

const TITLE = "Free link shortener with click analytics";
const DESCRIPTION =
	"Shorten links for free and see clicks by source, country, and device. Phones go to the right app store, and bots stay out of your counts.";

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
		question: "Is there an ad page before my site?",
		answer: "No. People go straight to your page, on every plan.",
	},
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
					footnote="Free on every plan."
					primaryLabel="Create your first link"
					secondaryLabel="Read the API docs"
					subtitle="Share one short link everywhere and see which post, email, or channel brings people in, in the same dashboard as your site analytics."
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
					body="When Slack or Discord loads your link, it shows your own title and image and adds nothing to the count."
					flip
					id="bots"
					title="Bots and link previews stay out of your click counts."
					visual={<BotCount />}
				/>

				<FeatureRow
					body="Point the link somewhere new any time, and every printed QR code follows it. Add your logo and color before you download."
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

				<FeatureSection id="faq">
					<FaqSection items={[...FAQ_ITEMS]} />
				</FeatureSection>

				<Footer />
			</div>
		</>
	);
}
