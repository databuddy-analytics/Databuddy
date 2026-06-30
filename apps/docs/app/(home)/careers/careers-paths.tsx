"use client";

type IconWeight = "regular" | "bold" | "fill" | "duotone";

import {
	EnvelopeSimpleIcon,
	GitBranchIcon,
	StarIcon,
} from "@databuddy/ui/icons";
import Link from "next/link";
import { SciFiCard } from "@/components/scifi-card";
import { SciFiButton } from "@/components/landing/scifi-btn";

interface Path {
	cta: { label: string; href: string; external?: boolean };
	description: string;
	highlight?: boolean;
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	tagline: string;
	title: string;
}

const paths: Path[] = [
	{
		icon: GitBranchIcon,
		title: "Contribute on GitHub",
		tagline: "The fastest way in",
		description:
			"Pick up a good-first-issue, fix a bug, improve the docs, or ship a feature from the roadmap. Every merged PR is a real audition, and we've hired from the contributors list before.",
		cta: {
			label: "Open issues",
			href: "https://github.com/databuddy-analytics/Databuddy/issues",
			external: true,
		},
		highlight: true,
	},
	{
		icon: StarIcon,
		title: "Join the Ambassador Program",
		tagline: "For builders who love the product",
		description:
			"If you're already using Databuddy and want to help grow it, the ambassador program comes with early access, a private channel, and a direct line to the team.",
		cta: { label: "Become an ambassador", href: "/ambassadors" },
	},
	{
		icon: EnvelopeSimpleIcon,
		title: "Pitch us directly",
		tagline: "For senior / specialist roles",
		description:
			"No formal openings right now, but if you'd genuinely move the needle (analytics, distributed systems, developer tooling, design, DevRel) send a short note and links to things you've built.",
		cta: { label: "support@databuddy.cc", href: "mailto:support@databuddy.cc" },
	},
];

function PathCard({ path }: { path: Path }) {
	const cta = path.cta;
	const isExternal = cta.external || cta.href.startsWith("mailto:");

	return (
		<SciFiCard variant={path.highlight ? "primary" : "foreground"}>
			<div
				className={`relative flex h-full flex-col rounded border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 ${
					path.highlight ? "border-primary/50 bg-primary/5" : "border-border"
				}`}
			>
				<div className="mb-4 flex items-start justify-between">
					<path.icon
						className={`size-8 ${
							path.highlight ? "text-primary" : "text-muted-foreground"
						} duration-300 group-hover:text-foreground`}
						weight="duotone"
					/>
					<span
						className={`rounded-full px-2 py-1 font-medium text-xs ${
							path.highlight
								? "bg-primary/20 text-primary"
								: "bg-muted/50 text-muted-foreground"
						}`}
					>
						{path.tagline}
					</span>
				</div>

				<h3 className="mb-2 font-semibold text-foreground text-lg">
					{path.title}
				</h3>
				<p className="mb-6 flex-1 text-pretty text-muted-foreground text-sm leading-relaxed">
					{path.description}
				</p>

				<div>
					<SciFiButton asChild>
						{isExternal ? (
							<a
								href={cta.href}
								rel={cta.external ? "noopener" : undefined}
								target={cta.external ? "_blank" : undefined}
							>
								{cta.label}
							</a>
						) : (
							<Link href={cta.href}>{cta.label}</Link>
						)}
					</SciFiButton>
				</div>
			</div>
		</SciFiCard>
	);
}

export default function CareersPaths() {
	return (
		<div>
			<div className="mb-12 text-center">
				<h2 className="mb-4 text-balance font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Three ways to work with us
				</h2>
				<p className="mx-auto max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
					We don't have a careers portal. We have a codebase, a community, and
					an inbox. Pick the door that fits.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
				{paths.map((path) => (
					<PathCard key={path.title} path={path} />
				))}
			</div>
		</div>
	);
}
