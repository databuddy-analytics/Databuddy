import { ArrowRightIcon } from "@databuddy/ui/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { CompetitorCard } from "@/components/compare/competitor-card";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { competitors } from "@/lib/comparison-config";

const compareTitle =
	"Databuddy vs Other Analytics Platforms - Feature Comparisons";
const compareDescription =
	"Side-by-side comparisons of Databuddy against Google Analytics, Plausible, Fathom, and more. See which privacy-first analytics platform fits your stack.";
const compareUrl = "https://www.databuddy.cc/compare";

export const metadata: Metadata = {
	title: compareTitle,
	description: compareDescription,
	openGraph: {
		title: compareTitle,
		description: compareDescription,
		url: compareUrl,
	},
	alternates: { canonical: compareUrl },
};

export default function ComparePage() {
	const entries = Object.entries(competitors);

	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title: compareTitle,
					description: compareDescription,
					url: compareUrl,
				}}
			/>

			<Section className="overflow-hidden" id="compare-hero">
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="text-center">
						<h1 className="mb-4 text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
							Compare{" "}
							<span className="text-muted-foreground">analytics platforms</span>
						</h1>
						<p className="mx-auto max-w-2xl text-balance text-muted-foreground text-sm leading-relaxed sm:text-base">
							See how Databuddy stacks up against other analytics platforms.
							AI-native, privacy-first, and free to start.
						</p>
					</div>
				</div>
			</Section>

			<Section
				className="border-border border-t border-b bg-background/50"
				id="competitors-grid"
			>
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{entries.map(([slug, data]) => (
							<CompetitorCard data={data} key={slug} />
						))}
					</div>

					<div className="mt-12 rounded border border-border bg-card/30 p-6 text-center backdrop-blur-sm sm:p-8">
						<h3 className="mb-2 font-semibold text-foreground text-lg">
							Don't see your platform?
						</h3>
						<p className="mb-5 text-pretty text-muted-foreground text-sm">
							We're adding new comparisons regularly. Try Databuddy today and
							see the difference.
						</p>
						<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
							<SciFiButton asChild>
								<Link
									href="https://app.databuddy.cc/register"
									rel="noopener noreferrer"
									target="_blank"
								>
									Start Free - No Credit Card
								</Link>
							</SciFiButton>
							<Link
								className="group inline-flex items-center justify-center gap-2 rounded border border-border bg-foreground/5 px-5 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-colors hover:bg-foreground/10 active:scale-[0.98]"
								href="/demo"
							>
								View Live Demo
								<ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
							</Link>
						</div>
					</div>
				</div>
			</Section>

			<Footer />
		</div>
	);
}
