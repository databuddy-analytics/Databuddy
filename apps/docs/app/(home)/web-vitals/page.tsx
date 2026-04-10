import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { ClosingCtaSection } from "@/components/landing/closing-cta-section";
import { FaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import { WebVitalsAlertCycleDemo } from "@/components/landing/web-vitals-alert-cycle-demo";
import { WebVitalsBreakdownDemo } from "@/components/landing/web-vitals-breakdown-demo";
import { WebVitalsGraphsDemo } from "@/components/landing/web-vitals-graphs-demo";
import { WebVitalsPercentileCycleDemo } from "@/components/landing/web-vitals-percentile-cycle-demo";
import { WebVitalsTrendsSparklinesDemo } from "@/components/landing/web-vitals-trends-sparklines-demo";
import { StructuredData } from "@/components/structured-data";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "Core Web Vitals Monitoring | Databuddy",
	description:
		"Monitor LCP, CLS, FID, INP, and TTFB from real users in production. Percentile breakdowns, page-level analysis, and device segmentation — built into your analytics.",
	alternates: {
		canonical: "https://www.databuddy.cc/web-vitals",
	},
	openGraph: {
		title: "Core Web Vitals Monitoring | Databuddy",
		description:
			"Monitor LCP, CLS, FID, INP, and TTFB from real users in production. Percentile breakdowns, page-level analysis, and device segmentation — built into your analytics.",
		url: "https://www.databuddy.cc/web-vitals",
		images: ["/og-image.png"],
	},
};

const CELL_TITLE_CLASS =
	"mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg";

const FAQ_ITEMS = [
	{
		question: "What is the difference between lab data and field data?",
		answer:
			"Lab data (like Lighthouse) runs in a controlled environment. Field data — what Databuddy collects — comes from real users on real devices and connections. Google uses field data for rankings, so field data is what matters.",
	},
	{
		question: "Which percentile does Google use to score my site?",
		answer:
			"Google scores your site at the 75th percentile, meaning 75% of your users need to have a Good experience. Databuddy shows p75 prominently so you always know where you stand.",
	},
	{
		question: "How does Databuddy measure INP?",
		answer:
			"Interaction to Next Paint is captured using the PerformanceObserver API, the same method used by Chrome. It measures responsiveness for all interactions — clicks, taps, and keyboard input.",
	},
	{
		question: "Can I see which specific pages are failing?",
		answer:
			"Yes. Vitals are tracked per URL, so you can see exactly which routes have poor LCP, high CLS, or slow INP. No more guessing which page is dragging down your overall score.",
	},
	{
		question: "Is web vitals monitoring included in all plans?",
		answer:
			"Web vitals are collected automatically on every plan — there's nothing to turn on. The free plan includes 7 days of history; paid plans extend that to 30 or 90 days.",
	},
] as const;

export default function WebVitalsPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Core Web Vitals Monitoring | Databuddy",
					description:
						"Monitor LCP, CLS, FID, INP, and TTFB from real users in production. Percentile breakdowns, page-level analysis, and device segmentation.",
					url: "https://www.databuddy.cc/web-vitals",
				}}
			/>
			<div className="overflow-x-hidden">
				<Section
					className="overflow-hidden border-border border-b"
					customPaddings
					id="hero"
				>
					<section className="relative flex w-full flex-col overflow-hidden">
						<div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-12 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8 lg:pt-24 lg:pb-24 xl:pb-32">
							<div className="flex w-full max-w-4xl flex-col items-start space-y-5 text-left sm:space-y-6">
								<h1 className="max-w-3xl text-balance font-bold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
									Slow pages hide in averages.
								</h1>

								<p className="max-w-2xl text-pretty font-medium text-muted-foreground text-sm leading-relaxed sm:text-base lg:text-lg">
									See exactly how your site performs for real users, not
									simulated tests. LCP, INP, CLS, FCP, and TTFB sliced by
									page, device, and country.
								</p>

								<div className="flex flex-wrap items-center justify-start gap-3">
									<Button asChild className="px-6 py-5 text-base sm:px-8">
										<a href="https://app.databuddy.cc/login">Start Free</a>
									</Button>
									<Button
										asChild
										className="px-6 py-5 text-base sm:px-8"
										variant="secondary"
									>
										<Link href="/docs/performance/core-web-vitals-guide">
											Read Docs
										</Link>
									</Button>
								</div>
							</div>
						</div>
					</section>
				</Section>

				<Section
					className="border-border border-b pt-12 pb-0 sm:pt-16 sm:pb-0 lg:pt-24 lg:pb-0 xl:pt-32 xl:pb-0"
					customPaddings
					id="breakdown"
				>
					<div className="mx-auto mb-8 w-full max-w-7xl px-4 sm:mb-10 sm:px-6 lg:px-8">
						<p className="mb-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
							Real user performance
						</p>
						<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
							Performance,{" "}
							<span className="text-muted-foreground">broken down.</span>
						</h2>
						<p className="mt-3 text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
							Every vital, sliced by page, device, and percentile, so you fix
							the right thing, not just the average.
						</p>
					</div>

					<div className="w-full border-border border-t border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Every vital, measured from real users.
								</h3>
								<WebVitalsGraphsDemo />
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Find out which environments are making users wait.
								</h3>
								<WebVitalsBreakdownDemo compact variant="browser" />
							</div>
						</div>
					</div>

					<div className="w-full border-border border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Pinpoint the pages hurting your score before users notice.								
								</h3>
								<WebVitalsBreakdownDemo compact />
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Optimize for the threshold Google actually uses to rank you.
								</h3>
								<WebVitalsPercentileCycleDemo />
							</div>
						</div>
					</div>
				</Section>

				<Section
					className="border-border border-b pt-12 pb-0 sm:pt-16 sm:pb-0 lg:pt-24 lg:pb-0 xl:pt-32 xl:pb-0"
					customPaddings
					id="monitoring"
				>
					<div className="mx-auto mb-8 w-full max-w-7xl px-4 sm:mb-10 sm:px-6 lg:px-8">
						<p className="mb-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
							Monitoring
						</p>
						<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
							Signal, <span className="text-muted-foreground">not noise</span>
						</h2>
						<p className="mt-3 text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
							Get alerted when a vital degrades. Track frequency over time to
							confirm your fix actually held.
						</p>
					</div>

					<div className="w-full border-border border-t border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="flex flex-col border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:min-h-[18rem] lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Know the moment something breaks.
								</h3>
								<WebVitalsAlertCycleDemo />
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Confirm the fix actually held.
								</h3>
								<div className="mt-3">
									<WebVitalsTrendsSparklinesDemo />
								</div>
							</div>
						</div>
					</div>
				</Section>

				<Section id="faq">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<FaqSection eyebrow="FAQ" items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<ClosingCtaSection docsHref="/docs/performance/core-web-vitals-guide" />

				<Footer />
			</div>
		</>
	);
}
