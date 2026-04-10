import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { ClosingCtaSection } from "@/components/landing/closing-cta-section";
import { ErrorAutoCaptureAlertsStackDemo } from "@/components/landing/error-auto-capture-alerts-stack-demo";
import { ErrorPerPageBreakdownDemo } from "@/components/landing/error-per-page-breakdown-demo";
import { ErrorFrequencyChartDemo } from "@/components/landing/error-frequency-chart-demo";
import { ErrorImpactTableArtifact } from "@/components/landing/error-who-it-affects-artifacts";
import { FaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "Error Tracking | Databuddy",
	description:
		"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts — built into your analytics stack.",
	alternates: {
		canonical: "https://www.databuddy.cc/errors",
	},
	openGraph: {
		title: "Error Tracking | Databuddy",
		description:
			"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts — built into your analytics stack.",
		url: "https://www.databuddy.cc/errors",
		images: ["/og-image.png"],
	},
};


const FAQ_ITEMS = [
	{
		question: "Will error tracking slow down my site?",
		answer:
			"No. The error tracking SDK is tiny and runs asynchronously. It only activates when something goes wrong — there's no polling, no impact on your page load time.",
	},
	{
		question: "How does Databuddy group errors?",
		answer:
			"Errors are grouped by their stack trace fingerprint, so the same bug hitting thousands of users shows up as one issue — not thousands. You can also manually merge or split groups.",
	},
	{
		question: "Can I see which users were affected by an error?",
		answer:
			"Yes. If you identify users in your analytics setup, every error is linked to the affected user sessions. You can see exactly who hit the bug and replay the context.",
	},
	{
		question: "Does it work with server-side errors too?",
		answer:
			"Yes. The Node.js SDK captures unhandled exceptions and rejections on the server side. Both client and server errors appear in the same dashboard.",
	},
	{
		question: "Is error tracking included in all plans?",
		answer:
			"Error tracking is available on every plan. The free plan gives you 1,000 error events per month — paid plans scale from there with higher limits and longer retention.",
	},
] as const;

const CELL_TITLE_CLASS =
	"mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg";

export default function ErrorsPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Error Tracking | Databuddy",
					description:
						"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts.",
					url: "https://www.databuddy.cc/errors",
				}}
			/>
			<div className="overflow-x-hidden">
				{/* Hero */}
				<Section
					className="overflow-hidden border-border border-b"
					customPaddings
					id="hero"
				>
					<section className="relative flex w-full flex-col overflow-hidden">
						<div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-12 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8 lg:pt-24 lg:pb-24 xl:pb-28">
							<div className="flex w-full max-w-4xl flex-col items-start space-y-5 text-left sm:space-y-6">

								<h1 className="max-w-3xl text-balance font-bold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
									Understand what your errors are costing users.
								</h1>

								<p className="max-w-2xl text-pretty font-medium text-muted-foreground text-sm leading-relaxed sm:text-base lg:text-lg">
									Every error tied to the session, the page, and the funnel step where it happened.
								</p>

								<div className="flex flex-wrap items-center justify-start gap-3">
									<Button asChild className="px-6 py-5 text-base sm:px-8">
										<a href="https://app.databuddy.cc/login">
											Start Monitoring
										</a>
									</Button>
									<Button
										asChild
										className="px-6 py-5 text-base sm:px-8"
										variant="secondary"
									>
										<Link href="/docs/error-tracking">Read Docs</Link>
									</Button>
								</div>
							</div>
						</div>
					</section>
				</Section>

				<Section
					className="border-border border-b pt-12 pb-0 sm:pt-16 sm:pb-0 lg:pt-24 lg:pb-0 xl:pt-32 xl:pb-0"
					customPaddings
					id="impact"
				>
					<div className="mx-auto mb-8 w-full max-w-7xl px-4 sm:mb-10 sm:px-6 lg:px-8">
						<p className="mb-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
							Impact
						</p>
						<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
							Prioritize by{" "}
							<span className="text-muted-foreground">real impact.</span>
						</h2>
						<p className="mt-3 text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
							See affected user counts, per-page error rates, and track progress post-fixes all in one place.
						</p>
					</div>

					<div className="w-full border-border border-t border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Find the one page generating all the errors.
								</h3>
								<ErrorPerPageBreakdownDemo />
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Know about errors before your users report them.
								</h3>
								<ErrorAutoCaptureAlertsStackDemo />
							</div>
						</div>
					</div>
					<div className="w-full border-border border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									An error hitting 500 users matters more than one hitting 1
									user 500 times.
								</h3>
								<ErrorImpactTableArtifact />
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									See when the error stops hitting users.
								</h3>
								<ErrorFrequencyChartDemo />
							</div>
						</div>
					</div>
				</Section>


				{/* FAQ */}
				<Section className="border-border border-b" id="faq">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<FaqSection eyebrow="FAQ" items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<ClosingCtaSection docsHref="/docs/error-tracking" />
				<Footer />
			</div>
		</>
	);
}
