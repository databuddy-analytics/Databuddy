import { FaDiscord, FaGithub, FaXTwitter } from 'react-icons/fa6';
import { IoMdMail } from 'react-icons/io';
import { Wordmark } from './landing/wordmark';
import { LogoContent } from './logo';

export function Footer() {
	return (
		<footer className="border-border border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="container mx-auto px-4 py-8">
				<div className="grid grid-cols-1 gap-6 md:grid-cols-4">
					<div className="space-y-3">
						<LogoContent />
						<p className="text-muted-foreground text-sm">
							Privacy-first web analytics without compromising user data.
						</p>
					</div>

					<div className="space-y-3">
						<h3 className="font-semibold">Product</h3>
						<ul className="space-y-2 text-sm">
							<li>
								<a
									className="text-muted-foreground hover:text-foreground"
									href="/docs"
								>
									Documentation
								</a>
							</li>
							<li>
								<a
									className="text-muted-foreground hover:text-foreground"
									href="/pricing"
								>
									Pricing
								</a>
							</li>
							<li>
								<a
									className="text-muted-foreground hover:text-foreground"
									href="https://app.databuddy.cc"
								>
									Dashboard
								</a>
							</li>
						</ul>
					</div>

					<div className="space-y-3">
						<h3 className="font-semibold">Company</h3>
						<ul className="space-y-2 text-sm">
							<li>
								<a
									className="text-muted-foreground hover:text-foreground"
									href="/blog"
								>
									Blog
								</a>
							</li>
							<li>
								<a
									className="text-muted-foreground hover:text-foreground"
									href="/privacy"
								>
									Privacy
								</a>
							</li>
							<li>
								<a
									className="text-muted-foreground hover:text-foreground"
									href="/terms"
								>
									Terms
								</a>
							</li>
						</ul>
					</div>

					<div className="space-y-3">
						<h3 className="font-semibold">Contact</h3>
						<ul className="space-y-2 text-sm">
							<li>
								<a
									className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
									href="mailto:support@databuddy.cc"
								>
									<IoMdMail className="h-4 w-4" />
									support@databuddy.cc
								</a>
							</li>
							<li>
								<a
									className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
									href="https://discord.gg/JTk7a38tCZ"
									rel="noopener"
									target="_blank"
								>
									<FaDiscord className="h-4 w-4" />
									Discord
								</a>
							</li>
							<li>
								<a
									className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
									href="https://github.com/databuddy-analytics"
									rel="noopener"
									target="_blank"
								>
									<FaGithub className="h-4 w-4" />
									GitHub
								</a>
							</li>
							<li>
								<a
									className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
									href="https://x.com/trydatabuddy"
									rel="noopener"
									target="_blank"
								>
									<FaXTwitter className="h-4 w-4" />X (Twitter)
								</a>
							</li>
						</ul>
					</div>
				</div>

				<div className="mt-6 flex flex-col items-center justify-between gap-4 border-border border-t pt-6 sm:flex-row">
					<p className="text-muted-foreground text-sm">
						© {new Date().getFullYear()} Databuddy
					</p>
					<div className="flex items-center gap-4">
						<a
							className="transition-opacity hover:opacity-80"
							href="https://twelve.tools"
							rel="noopener"
							target="_blank"
						>
							<img
								alt="Featured on Twelve Tools"
								className="h-auto max-w-[150px] sm:max-w-[200px]"
								height="40"
								src="https://twelve.tools/badge0-white.svg"
								width="150"
							/>
						</a>
						<p className="text-muted-foreground text-sm">
							Privacy-first analytics
						</p>
					</div>
				</div>
				<Wordmark />
			</div>
		</footer>
	);
}
