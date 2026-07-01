"use client";

import { Button } from "@databuddy/ui";
import { EnvelopeIcon } from "@databuddy/ui/icons";
import { SiDiscord, SiX } from "@icons-pack/react-simple-icons";
import Image from "next/image";
import Link from "next/link";
import { CCPAIcon } from "./icons/ccpa";
import { GDPRIcon } from "./icons/gdpr";
import { LogoContent } from "./logo";
import { NavLink } from "./nav-link";
import { NewsletterForm } from "./newsletter-form";

const footerSections = [
	{
		title: "Product",
		items: [
			{ href: "/docs", label: "Docs", navItem: "docs" },
			{ href: "/pricing", label: "Pricing", navItem: "pricing" },
			{
				href: "/calculator",
				label: "Cookie cost calculator",
				navItem: "calculator",
			},
			{ href: "/compare", label: "Compare", navItem: "compare" },
			{ href: "/changelog", label: "Changelog", navItem: "changelog" },
		],
	},
	{
		title: "Company",
		items: [
			{ href: "/blog", label: "Blog", navItem: "blog" },
			{ href: "/manifesto", label: "Manifesto", navItem: "manifesto" },
			{ href: "/contact", label: "Contact", navItem: "contact" },
			{
				external: true,
				href: "https://github.com/databuddy-analytics/Databuddy",
				label: "GitHub",
				navItem: "github",
			},
		],
	},
] as const;

const legalLinks = [
	{ href: "/privacy", label: "Privacy Policy" },
	{ href: "/data-policy", label: "Data Policy" },
	{ href: "/dpa", label: "DPA" },
	{ href: "/terms", label: "Terms of Service" },
] as const;

function FooterHero() {
	return (
		<div
			className="relative flex h-70 w-full items-start overflow-hidden rounded-lg bg-center bg-cover md:h-80"
			style={{ backgroundImage: "url('/brand/gradients/cta-bg.webp')" }}
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
					Every day without Databuddy is a day of data you'll never get back.
				</h2>
				<p className="mb-6 text-lg text-white/70">
					No credit card. No commitment. Set up in 5 minutes and see what you've
					been missing.
				</p>
				<div className="flex gap-3">
					<Button
						asChild
						className="bg-white text-black hover:bg-white/90"
						size="sm"
					>
						<a
							data-destination="register"
							data-placement="footer_hero"
							data-track="cta_clicked"
							href="https://app.databuddy.cc/register"
						>
							Start free
						</a>
					</Button>
					<Button
						asChild
						className="border-white/20 bg-white/10 text-white hover:bg-white/20"
						size="sm"
						variant="secondary"
					>
						<Link
							data-destination="demo"
							data-placement="footer_hero"
							data-track="cta_clicked"
							href="/demo"
						>
							Try the live demo
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}

function FooterIntro() {
	return (
		<div className="col-span-2 space-y-4 md:col-span-1">
			<LogoContent />
			<p className="text-muted-foreground text-sm sm:text-base">
				Privacy-first web analytics without compromising user data.
			</p>
			<div className="space-y-2 pt-2">
				<p className="font-medium text-foreground text-sm">
					Get product updates
				</p>
				<NewsletterForm source="footer" />
			</div>
		</div>
	);
}

function FooterSection({
	section,
}: {
	section: (typeof footerSections)[number];
}) {
	return (
		<div className="space-y-4">
			<h3 className="font-semibold text-base sm:text-lg">{section.title}</h3>
			<ul className="space-y-2 text-sm sm:text-base">
				{section.items.map((item) => (
					<li key={item.href}>
						<NavLink
							className="text-muted-foreground hover:text-foreground"
							external={"external" in item ? item.external : undefined}
							href={item.href}
							navItem={item.navItem}
							section="footer"
						>
							{item.label}
						</NavLink>
					</li>
				))}
			</ul>
		</div>
	);
}

function ConnectSection() {
	return (
		<div className="col-span-2 space-y-4 md:col-span-1">
			<h3 className="font-semibold text-base sm:text-lg">Connect</h3>
			<ul className="space-y-3 text-sm sm:text-base">
				<li>
					<NavLink
						className="group flex items-center gap-3 text-muted-foreground hover:text-foreground"
						href="mailto:support@databuddy.cc"
						navItem="email"
						section="footer"
					>
						<EnvelopeIcon className="size-5" />
						support@databuddy.cc
					</NavLink>
				</li>
				<li>
					<NavLink
						className="group flex items-center gap-3 text-muted-foreground hover:text-foreground"
						external
						href="https://discord.gg/JTk7a38tCZ"
						navItem="discord"
						section="footer"
					>
						<SiDiscord className="size-5" />
						Discord
					</NavLink>
				</li>
				<li>
					<NavLink
						className="group flex items-center gap-3 text-muted-foreground hover:text-foreground"
						external
						href="https://x.com/trydatabuddy"
						navItem="twitter"
						section="footer"
					>
						<SiX className="size-5" />X
					</NavLink>
				</li>
			</ul>
		</div>
	);
}

function FooterNav() {
	return (
		<div className="grid grid-cols-2 gap-8 sm:gap-10 md:grid-cols-4">
			<FooterIntro />
			{footerSections.map((section) => (
				<FooterSection key={section.title} section={section} />
			))}
			<ConnectSection />
		</div>
	);
}

function ComplianceLinks() {
	return (
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
					{legalLinks.map((link, index) => (
						<LegalLink index={index} key={link.href} link={link} />
					))}
				</div>
			</div>
		</div>
	);
}

function LegalLink({
	index,
	link,
}: {
	index: number;
	link: (typeof legalLinks)[number];
}) {
	return (
		<>
			{index > 0 && <span className="text-muted-foreground/50 text-xs">•</span>}
			<Link
				className="text-muted-foreground/70 text-xs hover:text-muted-foreground sm:text-sm"
				href={link.href}
			>
				{link.label}
			</Link>
		</>
	);
}

function FooterBottom() {
	return (
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
	);
}

export function Footer() {
	return (
		<footer className="border-border border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
			<div className="mx-auto flex w-full max-w-400 flex-col gap-8 px-4 pt-10 sm:px-14 lg:px-20">
				<FooterHero />
				<FooterNav />
				<ComplianceLinks />
				<FooterBottom />
			</div>
		</footer>
	);
}
