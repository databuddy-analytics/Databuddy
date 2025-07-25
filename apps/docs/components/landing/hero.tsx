"use client";

import Link from "next/link";
import { ArrowRight, Maximize2 } from "lucide-react";
import { useState, useRef } from "react";

export default function Hero() {
	const [isHovered, setIsHovered] = useState(false);
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const handleFullscreen = () => {
		if (iframeRef.current) {
			if (iframeRef.current.requestFullscreen) {
				iframeRef.current.requestFullscreen();
			}
		}
	};

	return (
		<section className="relative overflow-hidden min-h-screen">
			{/* Startup Fame Badge */}
			<div className="relative z-20 flex justify-center py-16 lg:py-20">
				<a href="https://startupfa.me/s/databuddy?utm_source=www.databuddy.cc" target="_blank" rel="noopener noreferrer">
					<img src="https://lightspeed.ac/?url=startupfa.me/badges/featured-badge-small-light.webp&w=3840&q=80&we&output=webp" alt="Featured on Startup Fame" width={220} height={60} className="rounded-md" />
				</a>
			</div>
			{/* Cool Grid Background */}
			<div className="absolute inset-0 bg-background" />
			<div className="absolute inset-0 bg-[linear-gradient(rgba(var(--primary),0.03)_2px,transparent_2px),linear-gradient(90deg,rgba(var(--primary),0.03)_2px,transparent_2px)] bg-[size:60px_60px]" />
			<div className="absolute inset-0 bg-[linear-gradient(rgba(var(--border),0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--border),0.1)_1px,transparent_1px)] bg-[size:20px_20px]" />

			{/* Gradient Overlays */}
			<div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(var(--primary),0.08)_0%,transparent_60%)]" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(var(--primary),0.06)_0%,transparent_60%)]" />

			<div className="relative z-10 container mx-auto px-4 py-12">
				<div className="flex flex-col items-center justify-center space-y-12">
					{/* Text Content */}
					<div className="text-center space-y-6 max-w-4xl mx-auto">
						{/* Badge */}
						<div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 backdrop-blur-sm px-4 py-2">
							<div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
							<span className="text-sm text-muted-foreground font-medium">
								GDPR Compliant • Cookie-Free • Real-time
							</span>
						</div>

						{/* Main headline */}
						<div className="space-y-4">
							<h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight">
								<span className="text-foreground">Privacy-first</span>
								<br />
								<span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
									analytics for devs
								</span>
							</h1>

							{/* Subheadline */}
							<p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
								Track users, not identities. Get fast, accurate insights with zero cookies and 100% GDPR compliance.
							</p>
						</div>
					</div>

					{/* Demo Section */}
					<div className="w-full max-w-[90vw] mx-auto">
						<div className="relative">
							<div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-xl blur-xl opacity-30" />
							<div
								className="relative bg-background/80 backdrop-blur-sm border border-border rounded-lg p-2 shadow-2xl group cursor-pointer"
								onMouseEnter={() => setIsHovered(true)}
								onMouseLeave={() => setIsHovered(false)}
								onClick={handleFullscreen}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										handleFullscreen();
									}
								}}
								aria-label="View demo dashboard fullscreen"
							>
								<iframe
									ref={iframeRef}
									src="https://app.databuddy.cc/demo/OXmNQsViBT-FOS_wZCTHc"
									className="w-full h-[500px] sm:h-[600px] lg:h-[700px] rounded border-0"
									title="Databuddy Demo Dashboard"
									loading="lazy"
									allowFullScreen
								/>

								{/* Fullscreen Button & Overlay */}
								<div className={`absolute inset-2 bg-background/20 dark:bg-background/40 rounded transition-opacity duration-300 flex items-center justify-center ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
									<div className="bg-card/90 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium shadow-lg border border-border hover:bg-card transition-colors">
										<Maximize2 className="h-4 w-4 text-foreground" />
										<span className="text-foreground">Click to view fullscreen</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* CTA Button */}
					<div className="flex justify-center">
						<Link
							href="https://app.databuddy.cc/register"
							className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-primary-foreground transition-all duration-300 bg-primary rounded-xl hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background shadow-lg hover:shadow-primary/20 transform hover:scale-105"
						>
							<span className="flex items-center gap-2">
								Start for Free
								<ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
							</span>
						</Link>
					</div>

					{/* Stats */}
					<div className="flex flex-wrap gap-12 justify-center">
						<div className="text-center">
							<div className="text-3xl sm:text-4xl font-bold text-foreground">65x</div>
							<div className="text-sm text-muted-foreground">Faster than GA4</div>
						</div>
						<div className="text-center">
							<div className="text-3xl sm:text-4xl font-bold text-foreground">500+</div>
							<div className="text-sm text-muted-foreground">Companies</div>
						</div>
						<div className="text-center">
							<div className="text-3xl sm:text-4xl font-bold text-foreground">0</div>
							<div className="text-sm text-muted-foreground">Cookies</div>
						</div>
					</div>
				</div>
			</div>

			{/* Trust indicators */}
			<div className="relative z-10 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="container mx-auto px-4 py-8">
					<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
						<div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 w-full md:w-auto">
							<span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">Trusted by developers at</span>
							<div className="flex flex-wrap items-center gap-2 sm:gap-4 text-muted-foreground">
								<a href="https://rivo.gg" className="text-xs sm:text-sm hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">Rivo.gg</a>
								<a href="https://better-auth.com" className="text-xs sm:text-sm hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">Better-auth</a>
								<a href="https://www.confinity.com" className="text-xs sm:text-sm hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">Confinity</a>
								<a href="https://useautumn.com" className="cursor-pointer text-xs sm:text-sm hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">Autumn</a>
								<span className="text-xs sm:text-sm text-muted-foreground">+496 more</span>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-muted-foreground">
							<span className="flex items-center gap-2 whitespace-nowrap">
								<div className="w-1.5 h-1.5 bg-primary rounded-full" />
								Free 30-day trial
							</span>
							<span className="flex items-center gap-2 whitespace-nowrap">
								<div className="w-1.5 h-1.5 bg-primary rounded-full" />
								No credit card required
							</span>
							<span className="flex items-center gap-2 whitespace-nowrap">
								<div className="w-1.5 h-1.5 bg-primary rounded-full" />
								Setup in 5 minutes
							</span>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}