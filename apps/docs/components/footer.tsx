"use client";

import { Button } from "@databuddy/ui";
import Image from "next/image";
import Link from "next/link";
import { FaDiscord, FaXTwitter } from "react-icons/fa6";
import { IoMdMail } from "react-icons/io";
import { CCPAIcon } from "./icons/ccpa";
import { GDPRIcon } from "./icons/gdpr";
import { Wordmark } from "./landing/wordmark";
import { LogoContent } from "./logo";
import { NewsletterForm } from "./newsletter-form";

export function Footer() {
	return (
		<footer className="border-border border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
			<div className="mx-auto flex w-full max-w-400 flex-col gap-8 px-4 pt-10 sm:px-14 lg:px-20">
				<div
					className="relative flex h-70 w-full items-start overflow-hidden rounded-lg bg-center bg-cover md:h-80"
					style={{
						backgroundImage: "url('/brand/gradients/cta-bg.png')",
					}}
				>
					<div className="absolute inset-0 bg-black/40" />
					<Image
						alt="logo"
						className="pointer-events-none absolute top-1/2 right-16 hidden -translate-y-1/2 opacity-80 lg:block"
						height={180}
						src="/brand/logomark/white.svg"
						width={180}
					/>
					<div className="relative max-w-5xl px-8 pt-8 sm:px-16 md:pt-16">
						<h2 className="mb-2 text-left font-medium text-2xl text-white leading-tight sm:text-4xl">
							Every day without Databuddy is a day of data you'll never get
							back.
						</h2>

						<p className="mb-6 text-lg text-white/70">
							No credit card. No commitment. Set up in 5 minutes and see what
							you've been missing.
						</p>
						<div className="flex gap-3">
							<Button
								asChild
								className="bg-white text-black hover:bg-white/90"
								size="sm"
							>
								<a href="https://app.databuddy.cc/register">Start free</a>
							</Button>
							<Button
								asChild
								className="border-white/20 bg-white/10 text-white hover:bg-white/20"
								size="sm"
								variant="secondary"
							>
								<Link href="/demo">Try the live demo</Link>
							</Button>
						</div>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-8 sm:gap-10 md:grid-cols-4">
					<div className="col-span-2 space-y-4 md:col-span-1">
						<LogoContent />
						<p className="text-muted-foreground text-sm sm:text-base">
							Privacy-first web analytics without compromising user data.
						</p>
						<div className="space-y-2 pt-2">
							<p className="font-medium text-foreground text-sm">
								Get product updates
							</p>
							<NewsletterForm />
						</div>
					</div>

					<div className="space-y-4">
						<h3 className="font-semibold text-base sm:text-lg">Product</h3>
						<ul className="space-y-2 text-sm sm:text-base">
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/docs"
								>
									Docs
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/pricing"
								>
									Pricing
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/calculator"
								>
									Cookie cost calculator
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/compare"
								>
									Compare
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/changelog"
								>
									Changelog
								</Link>
							</li>
						</ul>
					</div>

					<div className="space-y-4">
						<h3 className="font-semibold text-base sm:text-lg">Company</h3>
						<ul className="space-y-2 text-sm sm:text-base">
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/blog"
								>
									Blog
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/manifesto"
								>
									Manifesto
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/contact"
								>
									Contact
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="https://github.com/databuddy-analytics/Databuddy"
									rel="noopener"
									target="_blank"
								>
									GitHub
								</Link>
							</li>
						</ul>
					</div>

					<div className="col-span-2 space-y-4 md:col-span-1">
						<h3 className="font-semibold text-base sm:text-lg">Connect</h3>
						<ul className="space-y-3 text-sm sm:text-base">
							<li>
								<Link
									className="group flex items-center gap-3 text-muted-foreground hover:text-foreground"
									href="mailto:support@databuddy.cc"
								>
									<IoMdMail className="size-5" />
									support@databuddy.cc
								</Link>
							</li>
							<li>
								<Link
									className="group flex items-center gap-3 text-muted-foreground hover:text-foreground"
									href="https://discord.gg/JTk7a38tCZ"
									rel="noopener"
									target="_blank"
								>
									<FaDiscord className="size-5" />
									Discord
								</Link>
							</li>
							<li>
								<Link
									className="group flex items-center gap-3 text-muted-foreground hover:text-foreground"
									href="https://x.com/trydatabuddy"
									rel="noopener"
									target="_blank"
								>
									<FaXTwitter className="size-5" />X
								</Link>
							</li>
						</ul>
					</div>
				</div>

				<div className="mt-6">
					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-6">
							<Link
								aria-label="CCPA Compliance"
								className="text-foreground transition-colors hover:text-muted-foreground"
								href="/"
							>
								<CCPAIcon className="size-9" />
							</Link>
							<Link
								aria-label="GDPR Compliance"
								className="text-foreground transition-colors hover:text-muted-foreground"
								href="/"
							>
								<GDPRIcon className="size-11" />
							</Link>
						</div>
						<div className="flex flex-wrap items-center gap-4">
							<Link
								className="text-muted-foreground/70 text-xs hover:text-muted-foreground sm:text-sm"
								href="/privacy"
							>
								Privacy Policy
							</Link>
							<span className="text-muted-foreground/50 text-xs">•</span>
							<Link
								className="text-muted-foreground/70 text-xs hover:text-muted-foreground sm:text-sm"
								href="/data-policy"
							>
								Data Policy
							</Link>
							<span className="text-muted-foreground/50 text-xs">•</span>
							<Link
								className="text-muted-foreground/70 text-xs hover:text-muted-foreground sm:text-sm"
								href="/dpa"
							>
								DPA
							</Link>
							<span className="text-muted-foreground/50 text-xs">•</span>
							<Link
								className="text-muted-foreground/70 text-xs hover:text-muted-foreground sm:text-sm"
								href="/terms"
							>
								Terms of Service
							</Link>
						</div>
					</div>
				</div>

				<div className="mt-4 flex items-start justify-between gap-4 border-border border-t pt-4">
					<p className="text-muted-foreground text-sm sm:text-base">
						© {new Date().getFullYear()} Databuddy Analytics, Inc.
					</p>
					<div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
						<p className="text-muted-foreground text-sm sm:text-base">
							Privacy-first analytics
						</p>
					</div>
				</div>
				<Wordmark />
			</div>
		</footer>
	);
}
