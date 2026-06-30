import {
	CheckCircleIcon,
	EnvelopeIcon,
	FileTextIcon,
	LockSimpleIcon as LockKeyIcon,
	ShieldCheckIcon,
	ShieldCheckIcon as ShieldIcon,
} from "@databuddy/ui/icons";
import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { StructuredData } from "@/components/structured-data";

const title = "Data Processing Agreement - GDPR Article 28 DPA | Databuddy";
const description =
	"Our data processing agreement under Article 28 of the GDPR, covering our role as data processor when you use our analytics service.";
const url = "https://www.databuddy.cc/dpa";

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

export default function DPAPage() {
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
						<FileTextIcon className="size-7 text-primary" weight="duotone" />
					</div>
					<h1 className="mb-4 font-bold text-4xl md:text-5xl">
						Data Processing Agreement
					</h1>
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
							<strong>TL;DR</strong> - Our data processing agreement under
							Article 28 of the GDPR, covering our role as data processor when
							you use our analytics service. By using our service, you
							automatically agree to this DPA.
						</p>
					</div>
					<p className="mx-auto max-w-2xl text-muted-foreground">
						All of our data processing happens in the EU under strict European
						data protection standards. This means your visitor data benefits
						from some of the world's strongest privacy laws, regardless of where
						you're based.
					</p>
				</div>

				{/* DPA highlight */}
				<div className="mb-8 rounded border border-accent bg-accent/50 p-6">
					<h2 className="mb-3 flex items-center font-bold text-primary text-xl">
						<ShieldCheckIcon className="mr-2 size-5" weight="duotone" />
						GDPR Article 28 Compliance
					</h2>
					<p className="mb-4 text-muted-foreground">
						This Data Processing Agreement (DPA) explains our responsibilities
						as your data processor and your responsibilities as the data
						controller. By using our service, you automatically agree to this
						DPA - no separate signature required.
					</p>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div className="flex items-center text-primary">
							<LockKeyIcon className="mr-2 size-4" weight="duotone" />
							<span className="text-sm">EU Data Processing</span>
						</div>
						<div className="flex items-center text-primary">
							<ShieldIcon className="mr-2 size-4" weight="duotone" />
							<span className="text-sm">GDPR Compliant</span>
						</div>
						<div className="flex items-center text-primary">
							<CheckCircleIcon className="mr-2 size-4" weight="duotone" />
							<span className="text-sm">Automatic Agreement</span>
						</div>
					</div>
				</div>

				{/* Main content */}
				<div className="prose prose-lg dark:prose-invert max-w-none">
					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">
							What We Do with Your Data
						</h2>
						<p className="mb-4">
							We process visitor data from your websites to provide you with
							analytics insights. When someone visits your site, our script
							collects basic information and we turn that into the reports and
							metrics you see in your dashboard.
						</p>
						<p className="mb-4">
							This agreement stays active as long as you're using our service.
							When you decide to leave, we'll delete all your data unless you
							specifically ask us to return it to you first.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">
							Why We Process Your Data
						</h2>
						<p className="mb-4">
							We process visitor data for one reason only. To give you useful
							analytics about your website. That means turning raw visitor
							interactions into charts, reports, and insights you can actually
							use.
						</p>
						<p className="mb-4">
							We don't use your data for our own business purposes, we don't
							sell it to advertisers, and we don't share it with anyone unless
							legally required to do so. <strong>Your data is yours.</strong>
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">What Data We Handle</h2>
						<p className="mb-4">
							We process IP addresses (which we immediately discard after
							getting location info), anonymous visitor signatures, general
							location data like city and country, and basic browser
							information. All data is anonymous by default - we never identify
							individual visitors.
						</p>
						<p className="mb-4">
							The people whose data we process are your website visitors. Since
							we don't collect personal information or identify users, all data
							processing involves anonymous visitor data only.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Our Commitments to You</h2>
						<p className="mb-4">
							We only process your visitor data according to your instructions
							and the service settings you choose. We won't use your data for
							anything else without getting your explicit permission first.
						</p>
						<p className="mb-4">
							Everyone on our team who has access to data is trained on privacy
							requirements and bound by strict confidentiality agreements. We
							take data protection seriously at every level.
						</p>
						<p className="mb-4">
							We maintain strong security measures to protect your data from
							unauthorized access, changes, or disclosure. This includes
							encryption, access controls, and regular security assessments.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Your Responsibilities</h2>
						<p className="mb-4">
							As the data controller, you need to make sure you have a legal
							basis for collecting visitor data through our service. This might
							mean getting consent from visitors when required, or relying on
							legitimate interest for basic analytics.
						</p>
						<p className="mb-4">
							You should provide clear privacy notices to your website visitors
							that explain how their data is processed. This includes mentioning
							that we process data on your behalf.
						</p>
						<p className="mb-4">
							When visitors contact you about their data, you're responsible for
							handling their requests. We'll help you fulfill these requests
							when they involve data we process for you.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">
							How We Keep Your Data Secure
						</h2>
						<p className="mb-4">
							We use industry-standard security practices including encrypting
							data when it's transmitted and when it's stored, strict access
							controls, regular security reviews, and secure data centers in the
							EU.
						</p>
						<p className="mb-4">
							All personal data processing occurs exclusively within EU
							infrastructure provided by European companies for analytics event
							processing and storage. Some account, billing, and email delivery
							data is processed by our service providers and may involve
							international transfers depending on where those providers
							operate.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Our Partners</h2>
						<p className="mb-4">
							We work with a small number of trusted partners to deliver our
							service. This includes Hetzner for hosting our databases in
							Germany, Railway for our API infrastructure, Vercel for our
							dashboard, and Bunny.net for our CDN. We also use Resend for
							emails and Stripe for payments.
						</p>
						<p className="mb-4">
							All our partners are required to follow the same data protection
							standards we do. If we ever change partners, we'll let you know.
							For more details, see our{" "}
							<a
								className="text-primary hover:text-primary/80"
								href="/data-policy"
							>
								Data Policy
							</a>
							.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">If Something Goes Wrong</h2>
						<p className="mb-4">
							If there's ever a data breach that affects personal data we
							process for you, we'll notify you within 72 hours. We'll give you
							all the details you need to understand what happened and what
							we're doing about it.
						</p>
						<p className="mb-4">
							We'll also help you meet any legal requirements to notify
							authorities or affected individuals if needed.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">When You Leave</h2>
						<p className="mb-4">
							When you stop using our service or ask us to delete your data,
							we'll delete or return all the personal data we've processed for
							you, unless we're legally required to keep some of it.
						</p>
						<p className="mb-4">
							We retain data as long as your account or project exists. When you
							delete your account or project, we delete all associated data,
							including both anonymous analytics data and any personal
							information.
						</p>
						<p className="mb-4">
							We'll confirm the deletion is complete in writing. Some data might
							stay in our backups for a short time, but it won't be accessible
							for any processing.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Checking Up on Us</h2>
						<p className="mb-4">
							You have the right to audit how well we're following this
							agreement. We'll cooperate and provide the information you need to
							verify we're meeting our data protection commitments.
						</p>
						<p className="mb-4">
							We keep detailed records of how we process data and our security
							measures, which you can review during audits. Just give us
							reasonable notice so we can arrange it without disrupting our
							service.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">
							Who's Responsible for What
						</h2>
						<p className="mb-4">
							Our liability under this agreement follows the same limits as our{" "}
							<a className="text-primary hover:text-primary/80" href="/terms">
								Terms of Service
							</a>
							. If we mess up and it causes problems for you, we'll take
							responsibility for claims that result from our mistakes.
						</p>
						<p className="mb-4">
							Similarly, if you don't follow data protection laws or fail to get
							required consent from your visitors, you'll be responsible for any
							claims that result from those issues.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Governing Law</h2>
						<p className="mb-4">
							This DPA is governed by the laws applicable to our Terms of
							Service and forms part of our agreement with you. You do not need
							to sign this DPA separately. By using our service, you
							automatically agree to this DPA.
						</p>
					</section>

					<section className="mb-8">
						<h2 className="mb-4 font-bold text-2xl">Questions?</h2>
						<p className="mb-4">
							For questions about this Data Processing Agreement, please contact
							us:
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
							<a
								className="text-primary hover:text-primary/80"
								href="/data-policy"
							>
								Data Policy →
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
