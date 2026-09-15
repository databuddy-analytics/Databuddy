import {
	EnvelopeIcon,
	ShieldCheckIcon as ShieldIcon,
} from "@databuddy/ui/icons";
import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { StructuredData } from "@/components/structured-data";

const title = "Privacy Policy";
const description =
	"How Databuddy collects and uses account information, analytics data, optional user profiles, and information processed by connected services.";
const url = "https://www.databuddy.cc/privacy";

export const metadata: Metadata = {
	title,
	description,
	alternates: {
		canonical: url,
	},
	openGraph: {
		title,
		description,
		url,
		images: ["/og-image.png"],
	},
};

export default function PrivacyPage() {
	const lastUpdated = new Date("2026-09-15");

	return (
		<>
			<StructuredData
				page={{
					title,
					description,
					url,
					datePublished: new Date("2025-06-03").toISOString(),
					dateModified: lastUpdated.toISOString(),
				}}
			/>
			<div className="mx-auto w-full max-w-7xl px-4 pt-16 sm:px-6 lg:px-8 lg:pt-24">
				<div className="mb-12 text-center">
					<div className="mb-5 inline-flex items-center justify-center rounded border border-accent bg-accent/50 p-3">
						<ShieldIcon className="size-7 text-primary" />
					</div>
					<h1 className="mb-4 font-bold text-4xl md:text-5xl">
						Privacy Policy
					</h1>
					<p className="mb-4 text-pretty text-muted-foreground">
						Last Updated{" "}
						<span className="font-medium text-foreground">
							{lastUpdated.toLocaleDateString("en-US", {
								year: "numeric",
								month: "long",
								day: "numeric",
							})}
						</span>
					</p>
					<div className="mx-auto mb-6 max-w-2xl rounded border border-accent bg-accent/50 p-4 text-left">
						<p className="text-pretty text-foreground text-sm">
							Our analytics tracker uses browser storage instead of analytics
							cookies. Website owners can optionally identify users and send
							profile details. Databuddy account sign-in uses session cookies.
						</p>
					</div>
					<p className="mx-auto max-w-2xl text-muted-foreground">
						This policy explains how we collect, use, and protect information
						for both our customers and end users. We’re committed to
						privacy-first analytics that respects everyone’s privacy.
					</p>
				</div>
				<div className="prose prose-lg dark:prose-invert max-w-none">
					<p className="lead mb-8 text-lg text-muted-foreground">
						Databuddy ("we", "our", or "us") is a privacy-first analytics
						service that provides website insights without compromising user
						privacy. This Privacy Policy describes how we collect, use, and
						protect information when you use our service or visit websites that
						use our analytics.
					</p>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">
							Who This Policy Applies To
						</h2>
						<p className="mb-4">
							This privacy policy covers two groups of people:
						</p>
						<ul className="mb-4 space-y-2">
							<li>
								<strong>Customers:</strong> Individuals or organizations who
								sign up for and use Databuddy's analytics services for their
								websites.
							</li>
							<li>
								<strong>End Users:</strong> Visitors to websites that use
								Databuddy analytics. If you're visiting a website that uses our
								analytics, this policy explains what data we collect about you
								and how we protect your privacy.
							</li>
						</ul>
						<div className="my-4 rounded border border-accent bg-accent/50 p-4">
							<p className="text-sm">
								<strong className="text-primary">Note:</strong> We are committed
								to privacy-first analytics that respects the rights of all
								users, whether they are our customers or visitors to websites
								using our service.
							</p>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">
							Our Privacy-First Principles
						</h2>
						<ul className="mb-4 space-y-2">
							<li>
								<strong>Optional identification:</strong> Website owners choose
								whether to link activity to their own user IDs and profile
								details.
							</li>
							<li>
								<strong>Cookieless collection:</strong> The browser tracker uses
								first-party localStorage and sessionStorage for visitor and
								session information.
							</li>
							<li>
								<strong>Configurable visitor IDs:</strong> Ingestion salts and
								hashes visitor IDs by default. Website owners can change this
								behavior with the visitor-ID anonymization setting.
							</li>
							<li>
								<strong>Event-level analytics:</strong> We store individual
								events and session information to produce reports. Identified
								profiles may contain personal data supplied by the website
								owner.
							</li>
							<li>
								<strong>No data sales:</strong> We never sell or share user data
								with third parties for advertising or marketing purposes.
							</li>
						</ul>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Information We Collect</h2>

						<h3 className="mb-3 font-semibold text-xl">
							From Our Customers (Website Owners)
						</h3>
						<p className="mb-3">When you sign up for Databuddy, we collect:</p>
						<ul className="mb-6 space-y-2">
							<li>
								Account information: Email address, name (optional), and
								password
							</li>
							<li>
								Billing information: Payment details, billing address, and
								contact information for subscriptions
							</li>
							<li>
								Website information: Domain names and website URLs you want to
								track
							</li>
							<li>
								Usage data: How you use our dashboard and analytics features
							</li>
							<li>
								Communications: Support requests, feedback, and survey responses
							</li>
							<li>
								Account security information: Session identifiers, IP addresses,
								and browser information
							</li>
						</ul>

						<h3 className="mb-3 font-semibold text-xl">
							From End Users (Website Visitors)
						</h3>
						<p className="mb-4 text-pretty">
							Depending on the enabled features and information the website
							owner sends, we collect:
						</p>
						<ul className="mb-4 space-y-2">
							<li>
								Page addresses and titles, referrer addresses, and selected
								campaign and advertising-click parameters.
							</li>
							<li>
								Visitor and session IDs, timestamps, navigation activity, and
								enabled interaction measurements.
							</li>
							<li>
								Browser, operating system, device and viewport information,
								language, and time zone.
							</li>
							<li>
								Approximate country, region, and city derived from the request
								IP address.
							</li>
							<li>
								Custom events and properties, error messages and stack traces,
								and performance measurements.
							</li>
							<li>
								Profile IDs and optional names, email addresses, or other traits
								supplied through user identification.
							</li>
						</ul>
						<p className="mb-4 text-pretty">
							The standard browser tracker removes query strings from page and
							referrer addresses, but collects selected attribution parameters
							separately. URL paths, page titles, custom properties, errors, and
							optional profile details can still contain personal information.
							Website owners should review what they send and use the available
							masking and filtering controls.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 text-balance font-bold text-2xl">
							Cookieless Analytics and Browser Storage
						</h2>
						<p className="mb-4 text-pretty">
							The analytics tracker does not set analytics cookies. It stores a
							random visitor ID in localStorage and session information in
							sessionStorage. Advertising-click identifiers may also persist in
							localStorage. If the website identifies a user, the supplied
							profile ID is stored until cleared.
						</p>
						<p className="mb-4 text-pretty">
							The tracker honors Global Privacy Control, Do Not Track, and its
							stored opt-out settings. Cookieless collection does not by itself
							determine whether consent is required; that depends on the
							configuration, collected information, and applicable rules.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">How We Use Information</h2>

						<h3 className="mb-3 font-semibold text-xl">Customer Data Usage</h3>
						<p className="mb-3">We use customer information to:</p>
						<ul className="mb-6 space-y-2">
							<li>Provide and maintain our analytics service</li>
							<li>Process payments and manage subscriptions</li>
							<li>Send important service updates and security notifications</li>
							<li>Provide customer support and respond to inquiries</li>
							<li>Improve our service based on usage patterns</li>
							<li>Ensure compliance with legal obligations</li>
						</ul>

						<h3 className="mb-3 font-semibold text-xl">End User Data Usage</h3>
						<p className="mb-4 text-pretty">
							We process visitor information to provide the features the website
							owner uses, including analytics reports, session and profile
							views, error tracking, performance monitoring, and AI-assisted
							analysis.
						</p>
						<p className="mb-4 text-pretty">
							AI features send prompts and supporting context to the configured
							AI gateway and model providers. Connected delivery services
							receive the findings or messages the customer configures them to
							deliver. See our <a href="/data-policy">Data Policy</a> for
							service-provider information.
						</p>
						<div className="my-4 rounded border border-accent bg-accent/50 p-4">
							<p className="text-sm">
								<strong className="text-primary">Note:</strong> End user data is
								never used for advertising, marketing, or any purpose other than
								providing analytics insights to website owners.
							</p>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">GDPR and Privacy Rights</h2>

						<h3 className="mb-3 font-semibold text-xl">
							Legal Basis for Processing
						</h3>
						<p className="mb-3">
							Under GDPR, our legal basis for processing data is:
						</p>
						<ul className="mb-6 space-y-2">
							<li>
								<strong>Customer Data:</strong> Contractual necessity (to
								provide our service) and legitimate interests (service
								improvement)
							</li>
							<li>
								<strong>End User Data:</strong> The website owner determines the
								legal basis for collecting and using visitor information and is
								responsible for obtaining consent where required. Databuddy
								processes this information on the website owner’s behalf.
							</li>
						</ul>

						<h3 className="mb-3 font-semibold text-xl">
							Your Rights (Customers)
						</h3>
						<p className="mb-3">As a customer, you have the right to:</p>
						<ul className="mb-6 space-y-2">
							<li>
								<strong>Access:</strong> Request copies of your personal data
							</li>
							<li>
								<strong>Rectification:</strong> Correct inaccurate information
							</li>
							<li>
								<strong>Erasure:</strong> Request deletion of your account and
								data
							</li>
							<li>
								<strong>Portability:</strong> Export your data in a
								machine-readable format
							</li>
							<li>
								<strong>Restriction:</strong> Limit how we process your data
							</li>
							<li>
								<strong>Objection:</strong> Object to processing based on
								legitimate interests
							</li>
						</ul>

						<h3 className="mb-3 font-semibold text-xl">End User Rights</h3>
						<p className="mb-3">
							As an end user (website visitor), you have the right to:
						</p>
						<ul className="mb-4 space-y-2">
							<li>
								<strong>Information:</strong> Know what data is collected
								(detailed in this policy)
							</li>
							<li>
								<strong>Objection:</strong> Object to analytics tracking (use
								browser Do Not Track or ad blockers)
							</li>
							<li>
								<strong>Access, correction, and deletion:</strong> Contact the
								website owner about information collected through their website.
								We assist them with requests concerning data we process on their
								behalf. Whether a particular record can be located depends on
								the identifiers and information available.
							</li>
						</ul>
						<div className="my-4 rounded border border-accent bg-accent/50 p-4">
							<p className="text-pretty text-sm">
								Personal data does not lose its legal protections merely because
								an identifier is hashed or a visitor’s name is absent.
							</p>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Data Security</h2>
						<p className="mb-4 text-pretty">
							Customer workspaces use authentication and permission controls.
							Standard analytics event records omit the raw IP address after it
							is used for request handling and approximate location. Visitor-ID
							anonymization, path masking, filtering, and opt-out controls help
							limit collection.
						</p>
						<p className="mb-4 text-pretty">
							See our <a href="/docs/security">security documentation</a> for
							configuration details and our{" "}
							<a href="/dpa">Data Processing Agreement</a> for our security and
							data-protection commitments.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Contact Us</h2>
						<p className="mb-4">
							If you have any questions about this Privacy Policy, want to
							exercise your privacy rights, or have concerns about how your data
							is handled, please contact us:
						</p>
						<div className="mt-4 mb-6 rounded border bg-muted/50 p-5">
							<p className="mb-3 flex items-center text-primary">
								<EnvelopeIcon className="mr-2 size-5" />
								<a
									className="hover:underline"
									href="mailto:privacy@databuddy.cc"
								>
									privacy@databuddy.cc
								</a>
							</p>
							<p className="text-muted-foreground text-sm">
								We typically respond to privacy inquiries within 24 hours, and
								will fulfill data subject requests within 30 days as required by
								GDPR.
							</p>
						</div>
						<div className="flex flex-wrap gap-4">
							<a
								className="text-primary hover:text-primary/80"
								href="/data-policy"
							>
								Data Policy →
							</a>
							<a className="text-primary hover:text-primary/80" href="/dpa">
								Data Processing Agreement →
							</a>
							<a
								className="text-primary hover:text-primary/80"
								href="/docs/security"
							>
								Security & Privacy →
							</a>
							<a
								className="text-primary hover:text-primary/80"
								href="/docs/compliance/gdpr-compliance-guide"
							>
								GDPR Compliance Guide →
							</a>
						</div>
					</section>
				</div>
				<div className="mt-12">
					<Footer />
				</div>
			</div>
		</>
	);
}
