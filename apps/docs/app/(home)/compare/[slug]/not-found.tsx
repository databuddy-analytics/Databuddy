import { ArrowLeftIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { SciFiButton } from '@/components/landing/scifi-btn';
import Section from '@/components/landing/section';
import { Spotlight } from '@/components/landing/spotlight';

export default function NotFound() {
	return (
		<div className="overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<Section className="overflow-hidden" customPaddings id="not-found-hero">
				<section className="relative w-full pt-24 pb-24 sm:pt-32 sm:pb-32">
					<div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
						<div className="text-center">
							<h1 className="mb-4 font-semibold text-3xl leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
								<span className="block">
									Comparison <span className="text-muted-foreground">not</span>
								</span>
								<span className="block">
									<span className="text-muted-foreground">found</span>
								</span>
							</h1>
							<p className="mx-auto mb-8 max-w-2xl text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
								We don't have a comparison for this analytics platform yet, but
								we're constantly adding new ones.
							</p>

							<div className="mb-8 rounded border border-border bg-card/30 p-6 backdrop-blur-sm">
								<h3 className="mb-4 font-semibold text-foreground text-lg">
									Available Comparisons:
								</h3>
								<div className="flex flex-wrap justify-center gap-4">
									<Link
										className="rounded border border-primary/20 bg-primary/10 px-3 py-2 text-primary text-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-primary/20 hover:shadow-lg"
										href="/compare/plausible"
									>
										vs Plausible
									</Link>
									<Link
										className="rounded border border-primary/20 bg-primary/10 px-3 py-2 text-primary text-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-primary/20 hover:shadow-lg"
										href="/compare/google-analytics"
									>
										vs Google Analytics
									</Link>
									<Link
										className="rounded border border-primary/20 bg-primary/10 px-3 py-2 text-primary text-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-primary/20 hover:shadow-lg"
										href="/compare/fathom"
									>
										vs Fathom Analytics
									</Link>
								</div>
							</div>

							<div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
								<Link
									className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded border border-border bg-foreground/5 px-6 py-3 font-medium text-foreground backdrop-blur-sm transition-all hover:bg-foreground/10 active:scale-[0.98]"
									href="/compare"
								>
									<ArrowLeftIcon
										className="group-hover:-translate-x-0.5 h-4 w-4 transition-transform"
										weight="fill"
									/>
									All Comparisons
								</Link>
								<SciFiButton asChild>
									<Link
										href="https://app.databuddy.cc/login"
										rel="noopener noreferrer"
										target="_blank"
									>
										TRY DATABUDDY FREE
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
