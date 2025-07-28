'use client';

import { ArrowRight, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

export default function Hero() {
	const [isHovered, setIsHovered] = useState(false);
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const handleFullscreen = () => {
		if (iframeRef.current?.requestFullscreen) {
			iframeRef.current.requestFullscreen();
		}
	};

	return (
		<section className="relative min-h-screen overflow-hidden">
			{/* Cool Grid Background */}
			<div className="absolute inset-0 bg-background" />
			<div className="absolute inset-0 bg-[linear-gradient(rgba(var(--primary),0.03)_2px,transparent_2px),linear-gradient(90deg,rgba(var(--primary),0.03)_2px,transparent_2px)] bg-[size:60px_60px]" />
			<div className="absolute inset-0 bg-[linear-gradient(rgba(var(--border),0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--border),0.1)_1px,transparent_1px)] bg-[size:20px_20px]" />

			{/* Gradient Overlays */}
			<div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(var(--primary),0.08)_0%,transparent_60%)]" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(var(--primary),0.06)_0%,transparent_60%)]" />

			<div className="container relative z-10 mx-auto px-4 py-16">
				<div className="flex flex-col items-center justify-center space-y-12">
					{/* Text Content */}
					<div className="mx-auto max-w-4xl space-y-6 text-center">
						{/* Badge */}
						<div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-4 py-2 backdrop-blur-sm">
							<div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
							<span className="font-medium text-muted-foreground text-sm">
								GDPR Compliant • Cookie-Free • Real-time
							</span>
						</div>

						{/* Main headline */}
						<div className="space-y-4">
							<h1 className="font-semibold text-4xl tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
								<span className="text-foreground tracking-tight">
									Privacy-first
								</span>
								<br />
								<span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
									analytics for devs
								</span>
							</h1>

							{/* Subheadline */}
							<p className="mx-auto max-w-2xl text-lg text-muted-foreground leading-relaxed sm:text-xl lg:text-2xl">
								Track users, not identities. Get fast, accurate insights with
								zero cookies and 100% GDPR compliance.
							</p>
						</div>
					</div>

					{/* Demo Section */}
					<div className="mx-auto w-full max-w-[90vw]">
						<div className="relative">
							<div className="-inset-4 absolute rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 opacity-30 blur-xl" />
							<div
								className="group relative cursor-pointer rounded-lg border border-border bg-background/80 p-2 shadow-2xl backdrop-blur-sm"
								onClick={handleFullscreen}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										handleFullscreen();
									}
								}}
								onMouseEnter={() => setIsHovered(true)}
								onMouseLeave={() => setIsHovered(false)}
								role="tablist"
							>
								<iframe
									allowFullScreen
									className="h-[500px] w-full rounded border-0 sm:h-[600px] lg:h-[700px]"
									loading="lazy"
									ref={iframeRef}
									src="https://app.databuddy.cc/demo/OXmNQsViBT-FOS_wZCTHc"
									title="Databuddy Demo Dashboard"
								/>

								{/* Fullscreen Button & Overlay */}
								<div
									className={`absolute inset-2 flex items-center justify-center rounded bg-background/20 transition-opacity duration-300 dark:bg-background/40 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
								>
									<div className="flex items-center gap-2 rounded-lg border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm transition-colors hover:bg-card">
										<Maximize2 className="h-4 w-4 text-foreground" />
										<span className="text-foreground">
											Click to view fullscreen
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* CTA Button */}
					<div className="flex justify-center">
						<Link
							className="group relative inline-flex transform items-center justify-center rounded-xl bg-primary px-8 py-4 font-semibold text-lg text-primary-foreground shadow-lg transition-all duration-300 hover:scale-105 hover:bg-primary/90 hover:shadow-primary/20 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
							href="https://app.databuddy.cc/register"
						>
							<span className="flex items-center gap-2">
								Start for Free
								<ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
							</span>
						</Link>
					</div>

					{/* Stats */}
					<div className="flex flex-wrap justify-center gap-12">
						<div className="text-center">
							<div className="font-bold text-3xl text-foreground sm:text-4xl">
								65x
							</div>
							<div className="text-muted-foreground text-sm">
								Faster than GA4
							</div>
						</div>
						<div className="text-center">
							<div className="font-bold text-3xl text-foreground sm:text-4xl">
								500+
							</div>
							<div className="text-muted-foreground text-sm">Companies</div>
						</div>
						<div className="text-center">
							<div className="font-bold text-3xl text-foreground sm:text-4xl">
								0
							</div>
							<div className="text-muted-foreground text-sm">Cookies</div>
						</div>
					</div>
				</div>
			</div>

			{/* Trust indicators */}
			<div className="relative z-10 border-border border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="container mx-auto px-4 py-8">
					<div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center md:gap-6">
						<div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:gap-6 md:w-auto">
							<span className="whitespace-nowrap text-muted-foreground text-xs sm:text-sm">
								Trusted by developers at
							</span>
							<div className="flex flex-wrap items-center gap-2 text-muted-foreground sm:gap-4">
								<a
									className="text-xs transition-colors hover:text-foreground sm:text-sm"
									href="https://rivo.gg"
									rel="noopener noreferrer"
									target="_blank"
								>
									Rivo.gg
								</a>
								<a
									className="text-xs transition-colors hover:text-foreground sm:text-sm"
									href="https://better-auth.com"
									rel="noopener noreferrer"
									target="_blank"
								>
									Better-auth
								</a>
								<a
									className="text-xs transition-colors hover:text-foreground sm:text-sm"
									href="https://www.confinity.com"
									rel="noopener noreferrer"
									target="_blank"
								>
									Confinity
								</a>
								<a
									className="cursor-pointer text-xs transition-colors hover:text-foreground sm:text-sm"
									href="https://useautumn.com"
									rel="noopener noreferrer"
									target="_blank"
								>
									Autumn
								</a>
								<span className="text-muted-foreground text-xs sm:text-sm">
									+496 more
								</span>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs sm:gap-6">
							<span className="flex items-center gap-2 whitespace-nowrap">
								<div className="h-1.5 w-1.5 rounded-full bg-primary" />
								Free 30-day trial
							</span>
							<span className="flex items-center gap-2 whitespace-nowrap">
								<div className="h-1.5 w-1.5 rounded-full bg-primary" />
								No credit card required
							</span>
							<span className="flex items-center gap-2 whitespace-nowrap">
								<div className="h-1.5 w-1.5 rounded-full bg-primary" />
								Setup in 5 minutes
							</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
