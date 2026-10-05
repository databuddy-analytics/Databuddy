import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import {
	FeatureHero,
	FeatureRow,
	FeatureSection,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import {
	CertCountdown,
	CheckStrip,
	RetryCheck,
	StatusAlerts,
	StatusPagePreview,
} from "@/components/landing/uptime-demo-visuals";
import { StructuredData } from "@/components/structured-data";
import { TrackOnMount } from "@/components/track-on-mount";

const TITLE = "Free uptime monitoring and status pages";
const DESCRIPTION =
	"Check your site as often as every minute on the Free plan, get alerts in Slack, email, or a webhook, and keep customers updated on a public status page.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: {
		canonical: "https://www.databuddy.cc/uptime",
	},
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "https://www.databuddy.cc/uptime",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "How often does it check?",
		answer:
			"As often as every minute, or as rarely as once a day. You pick for each monitor.",
	},
	{
		question: "What counts as down?",
		answer:
			"A response of 400 or above, no response, or a timeout. Before a failure counts, it gets two retries two seconds apart, unless it timed out.",
	},
	{
		question: "Where do alerts go?",
		answer:
			"Slack, email, or a webhook. Link an alarm to the monitor and choose where it sends.",
	},
	{
		question: "Can I post incidents?",
		answer:
			"Yes. Post an incident on your status page and update it as you go, from investigating to resolved.",
	},
	{
		question: "Can the status page use my own domain?",
		answer: "Not yet. Status pages live at status.databuddy.cc/your-name.",
	},
	{
		question: "Does it cost extra?",
		answer:
			"No. It's on every plan, including free, and checks don't count toward your event quota.",
	},
] as const;

export default function UptimePage() {
	return (
		<>
			<TrackOnMount
				event="feature_landing_viewed"
				properties={{ feature: "uptime" }}
			/>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: TITLE,
					description: DESCRIPTION,
					url: "https://www.databuddy.cc/uptime",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs/uptime"
					footnote="Free on every plan, including 1-minute checks."
					primaryLabel="Start monitoring"
					secondaryLabel="Read the docs"
					subtitle="Databuddy checks your site as often as every minute, even on the Free plan, alerts your team the moment it fails, and shows uptime in the same dashboard as your traffic."
					title="Know your site is down before a customer tells you."
					visual={<CheckStrip />}
				/>

				<FeatureRow
					body="An error gets two more checks, two seconds apart, before anyone is alerted, so a brief blip stays quiet."
					id="retries"
					title="No 3am alerts for a one-second blip."
					visual={<RetryCheck />}
				/>

				<FeatureRow
					body="Alerts go to Slack, email, or a webhook, and a second message lets everyone know when it's back up."
					flip
					id="alerts"
					title="The whole team knows the moment it breaks."
					visual={<StatusAlerts />}
				/>

				<FeatureSection
					id="status-page"
					subtitle="Your public status page shows what's working and what you're fixing, with your logo and 90 days of history."
					title="Tell customers what's happening before they ask."
				>
					<StatusPagePreview />
				</FeatureSection>

				<FeatureRow
					body="You get a heads-up 14 days before it runs out, with time to renew before visitors see a security warning."
					id="ssl"
					title="Never let a certificate expire by surprise."
					visual={<CertCountdown />}
				/>

				<FeatureSection id="faq">
					<FaqSection items={[...FAQ_ITEMS]} />
				</FeatureSection>

				<Footer />
			</div>
		</>
	);
}
