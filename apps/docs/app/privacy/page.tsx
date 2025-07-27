import { Cookie, Mail, Shield, ShieldCheck, UserX } from 'lucide-react';

export const metadata = {
	title: 'Privacy Policy | Databuddy',
	description:
		"Databuddy's comprehensive privacy policy for our privacy-first analytics service. Learn how we protect both customer and end user data with GDPR compliance and no user identification.",
};

export default function PrivacyPage() {
	const lastUpdated = 'June 3rd, 2025';

	return (
		<div className="container mx-auto max-w-4xl px-4 py-12">
			{/* Header */}
			<div className="mb-12 text-center">
				<div className="mb-5 inline-flex items-center justify-center rounded-full border border-primary/20 bg-primary/10 p-3">
					<Shield className="h-7 w-7 text-primary" />
				</div>
				<h1 className="mb-4 font-bold text-4xl md:text-5xl">Privacy Policy</h1>
				<p className="mb-4 text-muted-foreground">
					Last Updated:{' '}
					<span className="font-medium text-foreground">{lastUpdated}</span>
				</p>
				<p className="mx-auto max-w-2xl text-muted-foreground">
					This policy explains how we collect, use, and protect information for
					both our customers and end users. We're committed to privacy-first
					analytics that respects everyone's privacy.
				</p>
			</div>

			{/* Privacy-first highlight */}
			<div className="mb-8 rounded-xl border border-primary/20 bg-primary/10 p-6">
				<h2 className="mb-3 flex items-center font-bold text-primary text-xl">
					<ShieldCheck className="mr-2 h-5 w-5" />
					Privacy-First Analytics
				</h2>
				<p className="mb-4 text-muted-foreground">
					Databuddy provides website analytics without compromising user
					privacy. We don't use cookies, don't track individual users, and never
					collect personal information from website visitors.
				</p>
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div className="flex items-center text-primary">
						<UserX className="mr-2 h-4 w-4" />
						<span className="text-sm">No User Tracking</span>
					</div>
					<div className="flex items-center text-primary">
						<Cookie className="mr-2 h-4 w-4" />
						<span className="text-sm">No Cookies</span>
					</div>
					<div className="flex items-center text-primary">
						<Shield className="mr-2 h-4 w-4" />
						<span className="text-sm">GDPR Compliant</span>
					</div>
				</div>
			</div>

			{/* Main content */}
			<div className="prose prose-lg dark:prose-invert max-w-none">
				<p className="lead mb-8 text-lg text-muted-foreground">
					Databuddy ("we", "our", or "us") is a privacy-first analytics service
					that provides website insights without compromising user privacy. This
					Privacy Policy describes how we collect, use, and protect information
					when you use our service or visit websites that use our analytics.
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
							<strong>Customers:</strong> Individuals or organizations who sign
							up for and use Databuddy's analytics services for their websites.
						</li>
						<li>
							<strong>End Users:</strong> Visitors to websites that use
							Databuddy analytics. If you're visiting a website that uses our
							analytics, this policy explains what data we collect about you and
							how we protect your privacy.
						</li>
					</ul>
					<div className="my-4 rounded-lg border border-primary/20 bg-primary/10 p-4">
						<p className="text-sm">
							<strong className="text-primary">Note:</strong> We are committed
							to privacy-first analytics that respects the rights of all users,
							whether they are our customers or visitors to websites using our
							service.
						</p>
					</div>
				</section>

				<section className="mb-8">
					<h2 className="mb-4 font-bold text-2xl">
						Our Privacy-First Principles
					</h2>
					<p className="mb-4">
						Databuddy is built on privacy-first principles that guide everything
						we do:
					</p>
					<ul className="space-y-2">
						<li>
							<strong>No User Identification:</strong> We never identify
							individual users or track them across websites or sessions.
						</li>
						<li>
							<strong>No Personal Data Collection:</strong> We don't collect
							names, email addresses, or any personally identifiable information
							from website visitors.
						</li>
						<li>
							<strong>No Cross-Site Tracking:</strong> We don't use cookies,
							fingerprinting, or other techniques to track users across
							different websites.
						</li>
						<li>
							<strong>IP Address Anonymization:</strong> We immediately
							anonymize IP addresses and never store them in their original
							form.
						</li>
						<li>
							<strong>Aggregated Data Only:</strong> All analytics data is
							aggregated and anonymized, making it impossible to identify
							individual users.
						</li>
						<li>
							<strong>No Data Sales:</strong> We never sell or share user data
							with third parties for advertising or marketing purposes.
						</li>
						<li>
							<strong>Minimal Data Collection:</strong> We only collect what's
							necessary to provide meaningful analytics insights.
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
							Account information: Email address, name (optional), and password
						</li>
						<li>
							Billing information: Payment details, billing address, and contact
							information for subscriptions
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
					</ul>

					<h3 className="mb-3 font-semibold text-xl">
						From End Users (Website Visitors)
					</h3>
					<p className="mb-3">
						When someone visits a website using Databuddy analytics, we collect
						minimal, anonymized data:
					</p>
					<ul className="mb-4 space-y-2">
						<li>
							Page views: Which pages were visited (URL path only, no query
							parameters containing personal data)
						</li>
						<li>
							Referrer information: Which website or search engine led to the
							visit (domain only)
						</li>
						<li>
							Technical information: Browser type, operating system, device
							type, and screen resolution
						</li>
						<li>
							Geographic location: Country and region only (derived from
							anonymized IP address)
						</li>
						<li>
							Session data: Time spent on site, bounce rate, and navigation
							patterns (anonymized)
						</li>
						<li>
							User preferences: Dark/light mode, language settings (if
							available)
						</li>
						<li>
							Performance metrics: Page load times, Core Web Vitals (FCP, LCP,
							CLS), and connection performance data
						</li>
						<li>
							User interaction data: Scroll depth, interaction counts, and exit
							intent detection (anonymized)
						</li>
						<li>
							Error information: JavaScript errors and technical issues to help
							website owners improve their sites
						</li>
					</ul>
					<div className="my-4 rounded-lg border border-primary/20 bg-primary/10 p-4">
						<p className="text-sm">
							<strong className="text-primary">Important:</strong> We
							immediately anonymize IP addresses using a one-way hash function.
							We never store IP addresses in their original form, and it's
							impossible for us to identify individual users from the data we
							collect.
						</p>
					</div>
				</section>

				<section className="mb-8">
					<h2 className="mb-4 font-bold text-2xl">No Cookies, No Tracking</h2>
					<p className="mb-4">
						Unlike traditional analytics services, Databuddy is designed to
						respect user privacy:
					</p>
					<ul className="mb-4 space-y-2">
						<li>
							<strong>No Cookies:</strong> We don't use cookies or any
							cross-site tracking to track users
						</li>
						<li>
							<strong>No Fingerprinting:</strong> We don't create browser
							fingerprints or use device characteristics to identify users
						</li>
						<li>
							<strong>No Cross-Site Tracking:</strong> We can't and don't track
							users as they move between different websites
						</li>
						<li>
							<strong>No User Profiles:</strong> We don't build profiles of
							individual users or their browsing habits
						</li>
					</ul>
					<p>
						This means end users visiting websites with Databuddy analytics
						enjoy complete privacy while still allowing website owners to
						understand their site's performance.
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
					<p className="mb-3">We use anonymized end user data solely to:</p>
					<ul className="mb-4 space-y-2">
						<li>Generate aggregated analytics reports for website owners</li>
						<li>
							Provide insights about website performance and user experience
						</li>
						<li>
							Help website owners understand their audience demographics
							(country/region level only)
						</li>
						<li>Monitor our service performance and detect technical issues</li>
						<li>
							Help website owners identify and fix technical problems through
							error tracking
						</li>
						<li>
							Provide performance optimization insights through Core Web Vitals
							and loading metrics
						</li>
					</ul>
					<div className="my-4 rounded-lg border border-primary/20 bg-primary/10 p-4">
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
							<strong>Customer Data:</strong> Contractual necessity (to provide
							our service) and legitimate interests (service improvement)
						</li>
						<li>
							<strong>End User Data:</strong> Legitimate interests of website
							owners to understand their site performance, balanced against user
							privacy rights
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
							<strong>Erasure:</strong> Since we don't identify individuals, we
							can't delete specific user data, but all data is automatically
							deleted according to our retention policies
						</li>
					</ul>
					<div className="my-4 rounded-lg border border-primary/20 bg-primary/10 p-4">
						<p className="text-sm">
							<strong className="text-primary">Note:</strong> Because we don't
							identify individual end users, many traditional rights don't
							apply, but this actually provides stronger privacy protection.
						</p>
					</div>
				</section>

				<section className="mb-8">
					<h2 className="mb-4 font-bold text-2xl">Data Security</h2>
					<p className="mb-4">We implement comprehensive security measures:</p>
					<ul className="mb-4 space-y-2">
						<li>
							<strong>Encryption:</strong> All data is encrypted in transit (TLS
							1.3) and at rest (AES-256)
						</li>
						<li>
							<strong>Access Controls:</strong> Strict employee access controls
							with multi-factor authentication
						</li>
						<li>
							<strong>Infrastructure:</strong> Hosted on secure, SOC 2 certified
							cloud infrastructure
						</li>
						<li>
							<strong>Monitoring:</strong> 24/7 security monitoring and
							automated threat detection
						</li>
						<li>
							<strong>Data Minimization:</strong> We collect and store only
							what's necessary
						</li>
						<li>
							<strong>Anonymization:</strong> IP addresses are immediately
							anonymized using cryptographic hashes
						</li>
					</ul>
					<div className="my-4 rounded-lg border border-primary/20 bg-primary/10 p-4">
						<p className="text-sm">
							<strong className="text-primary">Note:</strong> Our privacy-first
							approach means that even in the unlikely event of a data breach,
							individual users cannot be identified from the analytics data we
							store.
						</p>
					</div>
				</section>

				<section className="mb-8">
					<h2 className="mb-4 font-bold text-2xl">Contact Us</h2>
					<p className="mb-4">
						If you have any questions about this Privacy Policy, want to
						exercise your privacy rights, or have concerns about how your data
						is handled, please contact us:
					</p>
					<div className="mt-4 mb-6 rounded-lg border bg-muted/50 p-5">
						<p className="mb-3 flex items-center text-primary">
							<Mail className="mr-2 h-5 w-5" />
							<a className="hover:underline" href="mailto:privacy@databuddy.cc">
								privacy@databuddy.cc
							</a>
						</p>
						<p className="text-muted-foreground text-sm">
							We typically respond to privacy inquiries within 24 hours, and
							will fulfill data subject requests within 30 days as required by
							GDPR.
						</p>
					</div>
				</section>
			</div>
		</div>
	);
}
