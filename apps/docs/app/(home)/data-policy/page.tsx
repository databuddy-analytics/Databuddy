import {
	ClockIcon,
	DatabaseIcon,
	EnvelopeIcon,
	ArrowsDownUpIcon as FlowArrowIcon,
	GlobeIcon,
	CodeIcon as HashIcon,
	LockSimpleIcon as LockKeyIcon,
	ShieldCheckIcon,
	ShieldCheckIcon as ShieldIcon,
} from "@databuddy/ui/icons";
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
	const lastUpdated = new Date("2024-12-22");

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
				{/* Header */}
				<div className="mb-12 text-center">
					<div className="mb-5 inline-flex items-center justify-center rounded border border-accent bg-accent/50 p-3">
						<DatabaseIcon className="size-7 text-primary" weight="duotone" />
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
					{/* TL;DR */}
					<div className="mx-auto mb-6 max-w-2xl rounded border border-accent bg-accent/50 p-4 text-left">
						<p className="text-foreground text-sm">
							<strong>TL;DR</strong> - We don't use cookies, we don't track
							people across websites, and we can't identify individual visitors.
							Privacy-first by design.
						</p>
					</div>
					<p className="mx-auto max-w-2xl text-muted-foreground">
						We believe in radical transparency about how your data flows through
						our system. Here's exactly what happens when someone visits your
						website.
					</p>
				</div>

				{/* Privacy-first highlight */}
				<div className="mb-8 rounded border border-accent bg-accent/50 p-6">
					<h2 className="mb-3 flex items-center font-bold text-primary text-xl">
						<ShieldCheckIcon className="mr-2 size-5" weight="duotone" />
						Privacy-First Design
					</h2>
					<p className="mb-4 text-muted-foreground">
						We've designed our system from the ground up to be privacy-first.
						Unlike many analytics providers, we're going to walk you through
						exactly what happens from the moment our script loads to where that
						data ends up.
					</p>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div className="flex items-center text-primary">
							<LockKeyIcon className="mr-2 size-4" weight="duotone" />
							<span className="text-sm">No Cookies</span>
						</div>
						<div className="flex items-center text-primary">
							<GlobeIcon className="mr-2 size-4" weight="duotone" />
							<span className="text-sm">No Cross-Site Tracking</span>
						</div>
						<div className="flex items-center text-primary">
							<ShieldIcon className="mr-2 size-4" weight="duotone" />
							<span className="text-sm">Can't Identify Visitors</span>
						</div>
					</div>
				</div>

				{/* Main content */}
				<div className="prose prose-lg dark:prose-invert max-w-none">
					<section className="mb-8">
						<h2 className="mb-4 flex items-center font-bold text-2xl">
							<FlowArrowIcon
								className="mr-2 size-6 text-primary"
								weight="duotone"
							/>
							Our Tracking Script
						</h2>
						<p className="mb-4">
							When someone visits your website, our lightweight script
							(delivered via Bunny.net's global CDN) springs into action. It
							automatically sends us a pageview event with basic information
							about the visit.
						</p>
						<p className="mb-4">
							The browser naturally sends us the visitor's IP address and
							User-Agent string (which tells us their browser and operating
							system). We also send the page URL they visited, where they came
							from (referrer), and your project token to know which website this
							visit belongs to.
						</p>
						<p className="mb-4">
							Our script doesn't set cookies and sends only anonymous pageview
							and event data. We never collect personal information or identify
							individual users.
						</p>
						<div className="my-4 rounded border border-accent bg-accent/50 p-4">
							<p className="text-sm">
								<strong className="text-primary">Privacy Respect:</strong> If a
								visitor has Global Privacy Control or Do Not Track enabled in
								their browser, our script won't send analytics events.
							</p>
						</div>
						<p className="mb-4">
							Since we don't collect personal data, no consent is required. For
							more information, see our{" "}
							<a
								className="text-primary hover:text-primary/80"
								href="/docs/compliance/gdpr-compliance-guide"
							>
								GDPR compliance guide
							</a>
							.
						</p>

						<h3 className="mb-3 font-semibold text-xl">Event Types</h3>
						<p className="mb-3">
							Beyond basic pageviews, our script can track these types of
							interactions:
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
											Core Web Vitals (LCP, CLS, INP, FCP, TTFB) collected to
											help you understand your website's performance.
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 flex items-center font-bold text-2xl">
							<ShieldCheckIcon
								className="mr-2 size-6 text-primary"
								weight="duotone"
							/>
							Security and Protection
						</h2>
						<p className="mb-4">
							Before we process any visitor data, every request goes through our
							security checks. We automatically detect and filter out bot
							traffic using industry-standard bot detection. This keeps your
							analytics clean and accurate.
						</p>
						<p className="mb-4">
							We also implement rate limiting to prevent abuse. If an IP address
							makes too many requests in a short period, we temporarily block
							it. This is the only time we store IP addresses. These records
							automatically expire and are never used for anything beyond that.
						</p>
						<div className="my-4 rounded border border-accent bg-accent/50 p-4">
							<p className="text-sm">
								<strong className="text-primary">Note:</strong> Once a request
								passes these security checks, we process the visitor data.
							</p>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 flex items-center font-bold text-2xl">
							<HashIcon className="mr-2 size-6 text-primary" weight="duotone" />
							What We Collect
						</h2>
						<p className="mb-4">
							To count unique visitors without cookies or persistent tracking,
							we create what we call an "anonymous signature" for each visitor.
						</p>

						<h3 className="mb-3 font-semibold text-xl">
							How Anonymous Signatures Work
						</h3>
						<p className="mb-4">
							Here's exactly how it works. We take the visitor's IP address,
							their User-Agent string, your project token, and each project's
							unique daily salt that rotates at midnight. We combine these into
							a string and run it through SHA-256 hashing, creating a completely
							anonymous identifier that looks something like{" "}
							<code className="rounded bg-muted px-1.5 py-0.5 text-sm">
								a7b2c9d4e5f6...
							</code>
						</p>
						<p className="mb-4">
							Unless you have trillions of dollars, this hash is practically
							impossible to reverse back to the original IP address. Even if
							someone had our database, they couldn't figure out who visited
							your site. And because the salt changes daily, each anonymous
							visitor gets a completely different signature each day.
						</p>

						<h3 className="mb-3 font-semibold text-xl">IP Address Handling</h3>
						<p className="mb-4">
							What happens to the IP address? We use it for one last thing. We
							look up the visitor's approximate location. Once we get the
							location data, we immediately discard the IP address. It's never
							stored anywhere.
						</p>
						<p className="mb-4">
							Instead of storing precise coordinates like other analytics
							providers, we only store the city, region, country, and geoname
							ID. When we do need coordinates, we derive the city center
							coordinates from this ID. This means two people on opposite sides
							of New York for example will both show up at the exact same
							coordinates. They both appear at the center of New York.
						</p>
						<div className="my-4 rounded border border-accent bg-accent/50 p-4">
							<p className="text-sm">
								<strong className="text-primary">Privacy Layer:</strong> This
								provides an additional layer of privacy for your visitors.
							</p>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 flex items-center font-bold text-2xl">
							<DatabaseIcon
								className="mr-2 size-6 text-primary"
								weight="duotone"
							/>
							Storage and Retention
						</h2>
						<p className="mb-4">
							After processing, your analytics data is stored in ClickHouse, a
							super-fast database designed for analytics.
						</p>

						<h3 className="mb-3 font-semibold text-xl">Data Organization</h3>
						<p className="mb-3">
							We organize your data into four main buckets:
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
											Every pageview, click, and custom event with the anonymous
											signature, browser info, location data, and page details.
											Think of this as the raw activity log.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Sessions</td>
										<td className="py-3 text-muted-foreground">
											Aggregated data about visitor sessions. This includes how
											long they stayed, how many pages they viewed, bounce
											rates, and other session metrics. This is computed from
											the events data.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Profiles</td>
										<td className="py-3 text-muted-foreground">
											Anonymous visitor profiles built from aggregated events.
											These profiles contain only anonymous session data and
											never include personal information like names or emails.
										</td>
									</tr>
									<tr>
										<td className="py-3 pr-4 font-medium">Performance</td>
										<td className="py-3 text-muted-foreground">
											Core Web Vitals metrics (LCP, CLS, INP, FCP, TTFB) for
											each visitor's page visit.
										</td>
									</tr>
								</tbody>
							</table>
						</div>

						<h3 className="mt-6 mb-3 font-semibold text-xl">Data Retention</h3>
						<p className="mb-4">
							Most data is retained indefinitely while your account is active,
							except for performance metrics which are automatically deleted
							after one year.
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
						<h2 className="mb-4 flex items-center font-bold text-2xl">
							<GlobeIcon
								className="mr-2 size-6 text-primary"
								weight="duotone"
							/>
							Subprocessors
						</h2>
						<p className="mb-4">
							We work with a small number of carefully chosen partners to
							deliver our service. Here's exactly who has access to what.
						</p>
						<div className="overflow-x-auto">
							<table className="w-full rounded border border-accent">
								<thead>
									<tr className="border-accent border-b">
										<th className="py-3 pr-4 text-left font-semibold">
											Partner
										</th>
										<th className="py-3 text-left font-semibold">
											What They Do for Us
										</th>
									</tr>
								</thead>
								<tbody>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Hetzner</td>
										<td className="py-3 text-muted-foreground">
											European hosting company that provides the physical
											servers where your analytics data lives. They host our
											databases in Germany but never see or access your data.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Railway</td>
										<td className="py-3 text-muted-foreground">
											Provides infrastructure for our API and backend services.
											They host our application servers but don't have access to
											raw analytics data.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Vercel</td>
										<td className="py-3 text-muted-foreground">
											Hosts our dashboard application. They serve the frontend
											but analytics data is fetched directly from our EU
											servers.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Bunny.net</td>
										<td className="py-3 text-muted-foreground">
											Delivers our tracking script via their global CDN. Raw
											analytics data is sent directly to our EU servers and
											never passes through their network.
										</td>
									</tr>
									<tr className="border-accent/50 border-b">
										<td className="py-3 pr-4 font-medium">Resend</td>
										<td className="py-3 text-muted-foreground">
											Sends you emails about your account, billing, and product
											updates. They don't have access to your analytics data.
										</td>
									</tr>
									<tr>
										<td className="py-3 pr-4 font-medium">Stripe</td>
										<td className="py-3 text-muted-foreground">
											Handles payment processing. They only see payment-related
											data, not your website analytics.
										</td>
									</tr>
									<tr>
										<td className="py-3 pr-4 font-medium">Axiom</td>
										<td className="py-3 text-muted-foreground">
											OTEL tracer for observability. They don't have access to
											your raw analytics data. They only see the traces and
											metrics generated by our system.
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 flex items-center font-bold text-2xl">
							<ClockIcon
								className="mr-2 size-6 text-primary"
								weight="duotone"
							/>
							Why You Can Trust Us
						</h2>
						<p className="mb-4">
							We believe transparency builds trust. That's why we've walked you
							through exactly how your data flows through our system, what we
							collect, and how we protect your visitors' privacy.
						</p>
						<p className="mb-4">
							Unlike many analytics providers, we don't have hidden data
							collection, we don't sell your data to third parties, and we don't
							use your website data for our own business purposes.{" "}
							<strong>Your data belongs to you.</strong>
						</p>
						<p className="mb-4">
							We're committed to maintaining this level of transparency. If you
							have questions about how we handle data or want clarification on
							any part of this policy, we're here to help.
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
								<EnvelopeIcon className="mr-2 size-5" weight="duotone" />
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

				{/* Footer */}
				<div className="mt-12">
					<Footer />
				</div>
			</div>
		</>
	);
}
