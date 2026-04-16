import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { Spotlight } from "@/components/landing/spotlight";
import { competitors } from "@/lib/comparison-config";

export default function NotFound() {
	const entries = Object.entries(competitors);

	return (
		<div className="overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<Section className="overflow-hidden" customPaddings id="not-found-hero">
				<section className="relative w-full pt-24 pb-24 sm:pt-32 sm:pb-32">
					<div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8">
						<div className="text-center">
							<h1 className="mb-4 text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl">
								Comparison{" "}
								<span className="text-muted-foreground">not found</span>
							</h1>
							<p className="mx-auto mb-8 max-w-xl text-balance text-muted-foreground text-sm leading-relaxed sm:text-base">
								We don't have a comparison for this platform yet. Check out our
								existing comparisons below.
							</p>

							<div className="mb-8 rounded border border-border bg-card/30 p-5 backdrop-blur-sm">
								<h3 className="mb-3 font-semibold text-foreground text-sm">
									Available comparisons
								</h3>
								<div className="flex flex-wrap justify-center gap-2">
									{entries.map(([slug, data]) => (
										<Link
											className="rounded border border-border bg-muted/30 px-3 py-1.5 text-foreground text-sm transition-colors hover:bg-muted/60"
											href={`/compare/${slug}`}
											key={slug}
										>
											vs {data.competitor.name}
										</Link>
									))}
								</div>
							</div>

							<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
								<Link
									className="group inline-flex items-center justify-center gap-2 rounded border border-border bg-foreground/5 px-5 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-colors hover:bg-foreground/10 active:scale-[0.98]"
									href="/compare"
								>
									<ArrowLeftIcon
										className="size-3.5 transition-transform group-hover:-translate-x-0.5"
										weight="fill"
									/>
									All comparisons
								</Link>
								<SciFiButton asChild>
									<Link
										href="https://app.databuddy.cc/login"
										rel="noopener noreferrer"
										target="_blank"
									>
										Start Free — No Credit Card
									</Link>
								</SciFiButton>
							</div>
						</div>
					</div>
				</section>
			</Section>
		</div>
	);
}
