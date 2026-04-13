import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { ClosingCtaSection } from "@/components/landing/closing-cta-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FFAbTestingDemo } from "@/components/landing/ff-ab-testing-demo";
import { FFSegmentationDemo } from "@/components/landing/ff-segmentation-demo";
import { FFCompactFlagsDashboardDemo } from "@/components/landing/ff-compact-flags-dashboard-demo";
import { FFInstantRolloutsDemo } from "@/components/landing/ff-instant-rollouts-demo";
import { FFPercentageRolloutsDemo } from "@/components/landing/ff-percentage-rollouts-demo";
import { FFTemplatesMiniGridDemo } from "@/components/landing/ff-templates-mini-grid-demo";
import { FFUserTargetingDemo } from "@/components/landing/ff-user-targeting-demo";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "Feature Flags & A/B Testing | Databuddy",
	description:
		"Ship features safely with instant rollouts, percentage-based releases, A/B testing, and user targeting. No deploys needed — control everything from your dashboard.",
	alternates: {
		canonical: "https://www.databuddy.cc/feature-flags",
	},
	openGraph: {
		title: "Feature Flags & A/B Testing | Databuddy",
		description:
			"Ship features safely with instant rollouts, percentage-based releases, A/B testing, and user targeting. No deploys needed — control everything from your dashboard.",
		url: "https://www.databuddy.cc/feature-flags",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "Will feature flags slow down my app?",
		answer:
			"No. Flags load once and are cached locally, so your users never see a delay. Pages render just as fast with flags as without — there's no visible performance impact.",
	},
	{
		question: "Can I roll out a feature to just one team or customer first?",
		answer:
			"Yes. You can release to specific users, entire organizations, or teams before opening it up to everyone. This means you can validate with your biggest customer before a wider launch.",
	},
	{
		question: "What happens if something goes wrong after a release?",
		answer:
			"One click and the feature is off — no deploy, no rollback, no downtime. Your users see the previous experience immediately while you fix the issue.",
	},
	{
		question: "Can I run A/B tests to see which version performs better?",
		answer:
			"Yes. Create multiple variants, split traffic by percentage, and each user consistently sees the same version across sessions. You can measure which variant drives better outcomes and scale the winner.",
	},
	{
		question: "Are feature flags included in all plans?",
		answer:
			"Every plan includes feature flags — the free plan gives you 3 flags to start, and paid plans scale from there. No add-ons or hidden costs.",
	},
] as const;


export default function FeatureFlagsPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Feature Flags & A/B Testing | Databuddy",
					description:
						"Ship features safely with instant rollouts, percentage-based releases, A/B testing, and user targeting.",
					url: "https://www.databuddy.cc/feature-flags",
				}}
			/>
			<div className="overflow-x-hidden">
				{/* Hero — two-column */}
				<Section
					className="overflow-hidden border-border border-b"
					customPaddings
					id="hero"
				>
					<section className="relative flex w-full flex-col overflow-hidden">
						<div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-12 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8 lg:pt-24 lg:pb-24 xl:pb-28">
							<div className="flex w-full flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
								{/* Left — text */}
								<div className="max-w-xl items-start space-y-5">
									<h1 className="text-balance font-bold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
										Ship features safely and roll back in one click.
										
									</h1>

									<p className="text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
										Boolean toggles, percentage rollouts, and A/B experiments —
										controlled from your dashboard, no deploys needed. Built into
										Databuddy.
									</p>

									<div className="flex flex-wrap items-center gap-3">
										<Button asChild className="px-6 py-5 text-base sm:px-8">
											<a href="https://app.databuddy.cc/login">
												Start Free
											</a>
										</Button>
										<Button
											asChild
											className="px-6 py-5 text-base sm:px-8"
											variant="secondary"
										>
											<Link href="/docs/sdk/feature-flags">Read Docs</Link>
										</Button>
									</div>
								</div>
							</div>
						</div>
					</section>
				</Section>

				{/* "One dashboard, zero deploys" — left-right split */}
				<Section
					className="border-border border-b pt-12 pb-0 sm:pt-16 sm:pb-0 lg:pt-24 lg:pb-0 xl:pt-32 xl:pb-0"
					customPaddings
					id="how-it-works"
				>
					<div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8 lg:pb-10">
						<p className="mb-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
							How it works
						</p>
						<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
							One dashboard,{" "}
							<span className="text-muted-foreground">zero deploys.</span>
						</h2>
						<p className="mt-3 text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
							Create a flag, set your rules, and ship. Changes take effect
							immediately. No code changes, no CI pipeline, no waiting.
						</p>
					</div>

					<div className="w-full border-border border-t border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className="mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg">
									Every flag, one place.
								</h3>
								<FFCompactFlagsDashboardDemo />
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className="mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg">
									Start from a template or build from scratch.
								</h3>
								<FFTemplatesMiniGridDemo />
							</div>
						</div>
					</div>
				</Section>

				{/* "Deploy once, control everything" — 2×2 plus-sign grid */}
				<Section
					className="border-border border-b pt-12 pb-0 sm:pt-16 sm:pb-0 lg:pt-24 lg:pb-0 xl:pt-32 xl:pb-0"
					customPaddings
					id="capabilities"
				>
					<div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8 lg:pb-10">
						<p className="mb-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
							Capabilities
						</p>
						<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
							Deploy once,{" "}
							<span className="text-muted-foreground">control everything.</span>
						</h2>
						<p className="mt-3 text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
							From kill switches to multivariant experiments, we have everything you
							need to ship with confidence.
						</p>
					</div>

					<div className="w-full border-border border-t border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className="mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg">
									Toggle any feature on or off without deploying.
								</h3>
								<FFInstantRolloutsDemo />
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className="mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg">
									Ramp up gradually. Roll back instantly.
								</h3>
								<FFPercentageRolloutsDemo />
							</div>
						</div>
					</div>
					<div className="w-full border-border border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className="mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg">
									Run experiments with consistent assignments.
								</h3>
								<FFAbTestingDemo />
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className="mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg">
									Target by user, team, plan, or any property.
								</h3>
								<FFUserTargetingDemo />
							</div>
						</div>
					</div>
				</Section>

				{/* Section 3 — "Built for production" — 1×2 grid */}
				<Section
					className="border-border border-b pt-12 pb-0 sm:pt-16 sm:pb-0 lg:pt-24 lg:pb-0 xl:pt-32 xl:pb-0"
					customPaddings
					id="production"
				>
					<div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8 lg:pb-10">
						<p className="mb-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
							Under the hood
						</p>
						<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
							Built for production,{" "}
							<span className="text-muted-foreground">not just demos.</span>
						</h2>
						<p className="mt-3 text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
							Server rendering, request batching, and smart defaults, so flags
							never slow down your app or flash wrong content.
						</p>
					</div>

					<div className="w-full border-border border-t border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-5 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6">
								<h3 className="text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg">
									SSR-Safe Defaults
								</h3>
								<p className="text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
									Flags resolve on the server before the page loads. No flicker, no wrong state on first paint.						
								</p>
							</div>
							<div className="px-4 pt-5 pb-5 sm:px-6 lg:px-8 lg:pt-6">
								<h3 className="text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg">
									Request Batching
								</h3>
								<p className="text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
									Every flag check on a page collapses into one API call. Fast on load, instant on repeat visits.
								</p>
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

				<ClosingCtaSection docsHref="/docs/sdk/feature-flags" />

				<Footer />
			</div>
		</>
	);
}
