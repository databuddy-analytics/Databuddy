import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/app/util/constants";
import { CompetitorCard } from "@/components/compare/competitor-card";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { Spotlight } from "@/components/landing/spotlight";
import { StructuredData } from "@/components/structured-data";
import { competitors } from "@/lib/comparison-config";

const alternativesTitle =
	"Alternative to Google Analytics, Plausible & More (2026) | Databuddy";
const alternativesDescription =
	"Find a privacy-first analytics alternative for your stack. Compare pricing, features, and migration for every major platform — one page per tool.";
const alternativesUrl = `${SITE_URL}/alternatives`;

export const metadata: Metadata = {
	title: alternativesTitle,
	description: alternativesDescription,
	openGraph: {
		title: alternativesTitle,
		description: alternativesDescription,
		url: alternativesUrl,
	},
	alternates: { canonical: alternativesUrl },
};

export default function AlternativesHubPage() {
	const entries = Object.entries(competitors);

	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title: alternativesTitle,
					description: alternativesDescription,
					url: alternativesUrl,
				}}
			/>
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<div className="container mx-auto px-4 pt-8">
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Link className="transition-colors hover:text-foreground" href="/">
						Home
					</Link>
					<span>/</span>
					<span className="text-foreground">Alternatives</span>
				</div>
			</div>

			<Section
				className="overflow-hidden"
				customPaddings
				id="alternatives-hero"
			>
				<section className="relative w-full pt-12 pb-12 sm:pt-16 sm:pb-16 lg:pt-20 lg:pb-20">
					<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
						<div className="text-center">
							<h1 className="mb-4 text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
								Analytics{" "}
								<span className="text-muted-foreground">alternatives</span>
							</h1>
							<p className="mx-auto max-w-2xl text-balance text-muted-foreground text-sm leading-relaxed sm:text-base">
								Replacing a specific tool? Pick it below for pricing, features,
								and setup. The same deep comparison is also available as{" "}
								<Link
									className="font-medium text-foreground underline-offset-4 hover:underline"
									href="/compare"
								>
									standard Databuddy vs pages
								</Link>{" "}
								or with a{" "}
								<Link
									className="font-medium text-foreground underline-offset-4 hover:underline"
									href="/switch-from"
								>
									migration-focused view
								</Link>
								.
							</p>
						</div>
					</div>
				</section>
			</Section>

			<Section
				className="border-border border-t border-b bg-background/50"
				id="alternatives-grid"
			>
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{entries.map(([slug, data]) => (
							<CompetitorCard
								ctaLabel="View alternative page"
								data={data}
								headline={`Alternative to ${data.competitor.name}`}
								href={`/alternatives/${slug}`}
								key={slug}
							/>
						))}
					</div>

					<div className="mt-12 rounded border border-border bg-card/30 p-6 text-center backdrop-blur-sm sm:p-8">
						<h3 className="mb-2 font-semibold text-foreground text-lg">
							Ready to try Databuddy?
						</h3>
						<p className="mb-5 text-pretty text-muted-foreground text-sm">
							Start free with 10K monthly pageviews — no credit card.
						</p>
						<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
							<SciFiButton asChild>
								<Link
									href="https://app.databuddy.cc/login"
									rel="noopener noreferrer"
									target="_blank"
								>
									Start Free — No Credit Card
								</Link>
							</SciFiButton>
							<Link
								className="group inline-flex items-center justify-center gap-2 rounded border border-border bg-foreground/5 px-5 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-colors hover:bg-foreground/10 active:scale-[0.98]"
								href="/demo"
							>
								View Live Demo
								<ArrowRightIcon
									className="size-3.5 transition-transform group-hover:translate-x-0.5"
									weight="fill"
								/>
							</Link>
						</div>
					</div>
				</div>
			</Section>
		</div>
	);
}
