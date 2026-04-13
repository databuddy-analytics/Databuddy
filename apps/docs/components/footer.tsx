"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "./landing/wordmark";
import { LogoContent } from "./logo";
import { NewsletterForm } from "./newsletter-form";

export function Footer() {
	return (
		<footer className="border-border border-t bg-background/95 pt-10 backdrop-blur supports-backdrop-filter:bg-background/60 sm:pt-12 lg:pt-14">
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
				{/* CTA Section */}
				{/*<div className="py-32 text-center sm:py-36 lg:py-44">
					<h2 className="mb-5 text-balance font-semibold text-3xl text-foreground leading-snug sm:text-4xl lg:text-5xl">
						Better analytics start with one script.
					</h2>
					<div className="flex items-center justify-center gap-3">
						<Button asChild className="rounded text-md">
							<Link href="https://app.databuddy.cc/login">Start Free</Link>
						</Button>
						<Button asChild className="rounded text-md" variant="secondary">
							<Link href="/contact">Contact Us</Link>
						</Button>
					</div>
				</div> */}

				<div className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-[1fr_1fr_1fr_1fr_minmax(0,18rem)]">
					<div className="hidden space-y-4 sm:block">
						<LogoContent />
					</div>

					<div className="space-y-4">
						<h3 className="font-semibold text-sm">Product</h3>
						<ul className="space-y-2 text-sm">
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
						<h3 className="font-semibold text-sm">Company</h3>
						<ul className="space-y-2 text-sm">
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
						</ul>
					</div>

					<div className="space-y-4">
						<h3 className="font-semibold text-sm">Connect</h3>
						<ul className="space-y-2 text-sm">
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="mailto:support@databuddy.cc"
								>
									Email
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="https://discord.gg/JTk7a38tCZ"
									rel="noopener"
									target="_blank"
								>
									Discord
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="https://x.com/trydatabuddy"
									rel="noopener"
									target="_blank"
								>
									X
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

					<div className="order-5 col-span-2 space-y-4 sm:order-none sm:col-span-1">
						<h3 className="font-semibold text-sm">Newsletter</h3>
						<p className="text-muted-foreground text-sm">
							Get the latest analytics insights, product updates, and tips.
						</p>
						<NewsletterForm />
					</div>

					{/* Legal — mobile only, paired with Newsletter in the 2-col grid */}
					<div className="order-4 space-y-4 sm:hidden">
						<h3 className="font-semibold text-sm">Legal</h3>
						<ul className="space-y-2 text-sm">
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/privacy"
								>
									Privacy
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/terms"
								>
									Terms
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/dpa"
								>
									DPA
								</Link>
							</li>
							<li>
								<Link
									className="text-muted-foreground hover:text-foreground"
									href="/data-policy"
								>
									Data Policy
								</Link>
							</li>
						</ul>
					</div>

					{/* Bottom bar — mobile: copyright + theme toggle full width */}
					<div className="order-6 col-span-2 flex items-center justify-between pb-8 sm:hidden">
						<p className="text-muted-foreground/70 text-xs">
							© {new Date().getFullYear()} Databuddy
						</p>
						<ThemeToggle />
					</div>

					{/* Bottom bar — desktop only */}
					<div className="col-span-1 hidden items-center pt-6 pb-8 sm:flex">
						<p className="text-muted-foreground/70 text-sm">
							© {new Date().getFullYear()} Databuddy
						</p>
					</div>
					<div className="col-span-4 hidden items-center gap-4 pt-6 pb-8 sm:flex">
						<div className="flex items-center gap-4 whitespace-nowrap">
							<Link
								className="text-muted-foreground/60 text-sm hover:text-muted-foreground"
								href="/privacy"
							>
								Privacy
							</Link>
							<Link
								className="text-muted-foreground/60 text-sm hover:text-muted-foreground"
								href="/data-policy"
							>
								Data Policy
							</Link>
							<Link
								className="text-muted-foreground/60 text-sm hover:text-muted-foreground"
								href="/dpa"
							>
								DPA
							</Link>
							<Link
								className="text-muted-foreground/60 text-sm hover:text-muted-foreground"
								href="/terms"
							>
								Terms
							</Link>
						</div>
						<div className="ml-auto">
							<ThemeToggle />
						</div>
					</div>
				</div>
				<Wordmark />
			</div>
		</footer>
	);
}
