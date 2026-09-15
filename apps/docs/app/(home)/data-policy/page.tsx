import { DatabaseIcon, EnvelopeIcon } from "@databuddy/ui/icons";
import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { StructuredData } from "@/components/structured-data";

const title = "Data Policy - How Your Data Flows Through Databuddy";
const description =
	"How data flows through our system, what we collect, how we process it, and the steps we've taken to protect your visitors' privacy.";
const url = "https://www.databuddy.cc/data-policy";

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

export default function DataPolicyPage() {
	const lastUpdated = new Date("2026-09-15");

	return (
		<>
			<StructuredData
				page={{
					title,
					description,
					url,
					datePublished: new Date("2024-12-22").toISOString(),
					dateModified: lastUpdated.toISOString(),
				}}
			/>
			<div className="mx-auto w-full max-w-7xl px-4 pt-16 sm:px-6 lg:px-8 lg:pt-24">
				<div className="mb-12 text-center">
					<div className="mb-5 inline-flex items-center justify-center rounded border border-accent bg-accent/50 p-3">
						<DatabaseIcon className="size-7 text-primary" />
					</div>
					<h1 className="mb-4 font-bold text-4xl md:text-5xl">Data Policy</h1>
					<p className="mb-4 text-muted-foreground">
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
						<p className="text-foreground text-sm">
							Databuddy collects analytics without analytics cookies. Browser
							storage supports visitor and session measurement; optional
							identification links activity to profiles supplied by the website
							owner.
						</p>
					</div>
					<p className="mx-auto max-w-2xl text-muted-foreground">
						How collection, storage, and connected services work depends on the
						features and privacy settings you use.
					</p>
				</div>
				<div className="prose prose-lg dark:prose-invert max-w-none">
					<section className="mb-8">
						<h2 className="mb-4 flex items-center font-bold text-2xl">
							Our Tracking Script
						</h2>
						<p className="mb-4">
							The browser tracker sends pageviews and enabled events with the
							website ID, page and referrer information, and visitor and session
							IDs. The request also provides an IP address and browser headers
							for delivery, security checks, and approximate location.
						</p>
						<p className="mb-4">
							Page and referrer addresses exclude query strings by default.
							Selected campaign and advertising-click parameters are collected
							separately; hash fragments can be included when hash tracking is
							enabled.
						</p>
						<p className="mb-4">
							The tracker honors Global Privacy Control, Do Not Track, and
							stored opt-out settings. Whether consent is required depends on
							your configuration, the information you send, and applicable
							rules. See the{" "}
							<a href="/docs/compliance/gdpr-compliance-guide">
								consent and privacy guide
							</a>
							.
						</p>
						<h3 className="mb-3 font-semibold text-xl">Event Types</h3>
						<p className="mb-3">
							Depending on your configuration, the tracker can collect:
						</p>
						<div className="overflow-x-auto">
							<table className="w-full rounded border border-accent">
								<thead>
									<tr className="border-accent border-b">
										<th className="py-3 pr-4 text-left font-semibold">
											Event Type
										</th>
										<th className="py-3 text-left font-semibold">
											Description
										</th>
									</tr>
								</thead>
								<tbody>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Pageview</td>
										<td className="py-3 text-muted-foreground">
											Automatically tracked when someone visits a page.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Outgoing</td>
										<td className="py-3 text-muted-foreground">
											Tracked when someone clicks a link or button that leads to
											another website.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Custom</td>
										<td className="py-3 text-muted-foreground">
											Custom events can be anything, for example button clicks
											or form submissions.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Heartbeat</td>
										<td className="py-3 text-muted-foreground">
											Periodically sent to help track page durations and session
											continuity.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Error</td>
										<td className="py-3 text-muted-foreground">
											JavaScript errors and unhandled promise rejections tracked
											to help identify and fix technical issues.
										</td>
									</tr>
									<tr>
										<td className="py-3 pr-4 font-medium">Performance</td>
										<td className="py-3 text-muted-foreground">
											Performance measurements including FCP, LCP, INP, CLS,
											TTFB, and FPS.
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Security and Protection</h2>
						<p className="mb-4">
							Requests undergo validation, rate limiting, and bot checks.
							Security controls may temporarily process or retain request
							identifiers, including IP addresses. Standard analytics event
							records omit raw IP addresses.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">What We Collect</h2>
						<h3 className="mb-3 font-semibold text-xl">
							Visitor and Session IDs
						</h3>
						<p className="mb-4">
							The browser generates a random visitor ID and stores it in
							localStorage. A session ID and session timing information are
							stored in sessionStorage.
						</p>
						<p className="mb-4">
							By default, ingestion hashes the visitor ID with a rotating daily
							salt before storing analytics events. The{" "}
							<code>anonymizeVisitorIds</code> setting can disable this
							transformation or apply it according to the visitor’s country.
						</p>
						<p className="mb-4">
							Calling <code>identify()</code> creates or updates a profile using
							the supplied profile ID and traits, and links activity to that
							profile. Profile IDs are not made anonymous by the visitor-ID
							setting.
						</p>
						<h3 className="mb-3 font-semibold text-xl">IP Address Handling</h3>
						<p className="mb-4">
							The ingestion service uses the request IP address for security
							checks and an approximate country, region, and city lookup.
							Standard analytics event records leave the raw IP field empty.
						</p>
						<p className="mb-4">
							This location is inferred from an IP address, rather than
							collected from the device’s GPS. It should not be treated as a
							visitor’s precise location.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 flex items-center font-bold text-2xl">
							<DatabaseIcon className="mr-2 size-6 text-primary" />
							Storage and Retention
						</h2>
						<p className="mb-4">
							Analytics events are stored in ClickHouse. Supporting account,
							website, and profile records are stored separately.
						</p>

						<h3 className="mb-3 font-semibold text-xl">Data Organization</h3>
						<p className="mb-3">
							We store event-level analytics and supporting application data,
							including:
						</p>
						<div className="overflow-x-auto">
							<table className="w-full rounded border border-accent">
								<thead>
									<tr className="border-accent border-b">
										<th className="py-3 pr-4 text-left font-semibold">
											Data Type
										</th>
										<th className="py-3 text-left font-semibold">
											What's Stored
										</th>
									</tr>
								</thead>
								<tbody>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Events</td>
										<td className="py-3 text-muted-foreground">
											Pageviews and enabled events, with visitor/session IDs,
											page details, technical context, attribution parameters,
											and any supplied profile ID or properties.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Sessions</td>
										<td className="py-3 text-muted-foreground">
											Activity and measurements grouped by session.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Profiles</td>
										<td className="py-3 text-muted-foreground">
											Optional profile IDs, supplied names or emails, custom
											traits, and links to visitor activity.
										</td>
									</tr>
									<tr>
										<td className="py-3 pr-4 font-medium">Performance</td>
										<td className="py-3 text-muted-foreground">
											Collected performance measurements associated with the
											page and session.
										</td>
									</tr>
								</tbody>
							</table>
						</div>

						<h3 className="mt-6 mb-3 font-semibold text-xl">Data Retention</h3>
						<p className="mb-4">
							Most data is retained indefinitely while your account is active.
							We target one year for performance metrics, but automatic expiry
							is not guaranteed. You can request deletion if you need data
							removed by a specific date.
						</p>
						<p className="mb-4">
							Long-term retention is part of the product so you can understand
							how your website and business change over years. You can delete
							your project or account at any time to remove your analytics data
							from our servers.
						</p>
						<div className="my-4 rounded border border-accent bg-accent/50 p-4">
							<p className="text-sm">
								<strong className="text-primary">Background Processing:</strong>{" "}
								Events aren't stored immediately. Instead, they're queued for
								background processing, which allows us to batch operations
								efficiently and apply additional privacy protections before
								anything hits the database.
							</p>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Subprocessors</h2>
						<p className="mb-4">
							Service providers process the information needed for the features
							they operate. The roles below describe these services; processing
							locations depend on the provider and configured feature. Contact{" "}
							<a href="mailto:privacy@databuddy.cc">privacy@databuddy.cc</a> for
							the current subprocessor inventory and transfer information.
						</p>
						<dl className="divide-y divide-border">
							<div className="py-3">
								<dt className="font-semibold">Hetzner</dt>
								<dd className="text-muted-foreground">
									Hosting infrastructure.
								</dd>
							</div>
							<div className="py-3">
								<dt className="font-semibold">Railway</dt>
								<dd className="text-muted-foreground">
									Application and backend hosting.
								</dd>
							</div>
							<div className="py-3">
								<dt className="font-semibold">Vercel</dt>
								<dd className="text-muted-foreground">
									Website and dashboard hosting; AI Gateway routes AI requests
									to configured model providers.
								</dd>
							</div>
							<div className="py-3">
								<dt className="font-semibold">Bunny.net</dt>
								<dd className="text-muted-foreground">
									Delivery of tracker and other static assets.
								</dd>
							</div>
							<div className="py-3">
								<dt className="font-semibold">Resend</dt>
								<dd className="text-muted-foreground">Email delivery.</dd>
							</div>
							<div className="py-3">
								<dt className="font-semibold">Stripe</dt>
								<dd className="text-muted-foreground">Payment processing.</dd>
							</div>
							<div className="py-3">
								<dt className="font-semibold">Autumn</dt>
								<dd className="text-muted-foreground">
									Subscription management, billing entitlements, and metered
									usage. Billing requests include the customer ID, name, and
									email.
								</dd>
							</div>
							<div className="py-3">
								<dt className="font-semibold">AI model providers</dt>
								<dd className="text-muted-foreground">
									Process prompts and supporting context used by AI features.
									The provider depends on the configured model.
								</dd>
							</div>
							<div className="py-3">
								<dt className="font-semibold">Axiom</dt>
								<dd className="text-muted-foreground">
									Application observability and diagnostic telemetry.
								</dd>
							</div>
						</dl>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Data Use</h2>
						<p className="mb-4">
							We do not sell your data to third parties or use your visitor
							information for our own advertising or marketing. Your data
							belongs to you. Our <a href="/privacy">Privacy Policy</a> and{" "}
							<a href="/dpa">Data Processing Agreement</a> describe our
							commitments.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Questions?</h2>
						<p className="mb-4">
							If you have any questions about this Data Policy or how we handle
							your data, please reach out:
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
								We typically respond to inquiries within 24 hours.
							</p>
						</div>
						<div className="flex flex-wrap gap-4">
							<a className="text-primary hover:text-primary/80" href="/privacy">
								Privacy Policy →
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
