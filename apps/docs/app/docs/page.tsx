import type { Metadata } from "next";
import Link from "next/link";
import {
	DOCS_SECTION_LABELS,
	groupDocsBySection,
	listDocs,
	orderedSectionKeys,
} from "@/lib/agent-docs";
import { SITE_URL } from "../util/constants";

export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Databuddy Documentation",
	description:
		"Guides and API reference for Databuddy analytics, SDKs, integrations, privacy, and performance monitoring.",
	alternates: {
		canonical: `${SITE_URL}/docs`,
	},
};

export default async function DocsIndexPage() {
	const docs = await listDocs();
	const grouped = groupDocsBySection(docs);
	const sections = orderedSectionKeys(grouped);

	return (
		<main className="min-h-dvh bg-background text-foreground">
			<header className="border-border border-b">
				<nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
					<Link className="font-semibold text-base" href="/">
						Databuddy
					</Link>
					<div className="flex items-center gap-4 text-muted-foreground text-sm">
						<Link
							className="transition-colors hover:text-foreground"
							href="/pricing"
						>
							Pricing
						</Link>
						<Link
							className="transition-colors hover:text-foreground"
							href="/changelog"
						>
							Changelog
						</Link>
						<a
							className="transition-colors hover:text-foreground"
							href="https://app.databuddy.cc/register"
						>
							Start free
						</a>
					</div>
				</nav>
			</header>

			<section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-14">
				<div>
					<p className="font-medium text-muted-foreground text-sm">
						Documentation
					</p>
					<h1 className="mt-3 font-semibold text-4xl tracking-normal sm:text-5xl">
						Build privacy-first analytics with Databuddy.
					</h1>
					<p className="mt-5 max-w-2xl text-lg text-muted-foreground leading-8">
						Start with the SDK guides, wire up your framework, then use the API
						reference for custom reporting and automation.
					</p>
					<div className="mt-7 flex flex-wrap gap-3">
						<Link
							className="inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 font-medium text-background text-sm transition-opacity hover:opacity-90"
							href="/docs/getting-started"
						>
							Get started
						</Link>
						<Link
							className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 font-medium text-sm transition-colors hover:bg-muted"
							href="/docs/sdk"
						>
							SDK guides
						</Link>
						<a
							className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 font-medium text-sm transition-colors hover:bg-muted"
							href="/llms.txt"
						>
							llms.txt
						</a>
					</div>
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					<Link
						className="rounded-md border border-border p-4 transition-colors hover:bg-muted"
						href="/docs/Integrations"
					>
						<h2 className="font-semibold text-base">Integrations</h2>
						<p className="mt-2 text-muted-foreground text-sm leading-6">
							Framework and CMS setup for React, Next.js, Shopify, WordPress,
							and more.
						</p>
					</Link>
					<Link
						className="rounded-md border border-border p-4 transition-colors hover:bg-muted"
						href="/docs/api"
					>
						<h2 className="font-semibold text-base">API Reference</h2>
						<p className="mt-2 text-muted-foreground text-sm leading-6">
							Authentication, events, queries, links, errors, and rate limits.
						</p>
					</Link>
					<Link
						className="rounded-md border border-border p-4 transition-colors hover:bg-muted"
						href="/docs/privacy/cookieless-analytics-guide"
					>
						<h2 className="font-semibold text-base">Privacy</h2>
						<p className="mt-2 text-muted-foreground text-sm leading-6">
							Cookieless analytics, GDPR defaults, and compliance guidance.
						</p>
					</Link>
					<Link
						className="rounded-md border border-border p-4 transition-colors hover:bg-muted"
						href="/docs/performance/core-web-vitals-guide"
					>
						<h2 className="font-semibold text-base">Performance</h2>
						<p className="mt-2 text-muted-foreground text-sm leading-6">
							Core Web Vitals, error tracking, and fast analytics collection.
						</p>
					</Link>
				</div>
			</section>

			<section className="border-border border-t">
				<div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
					<h2 className="font-semibold text-2xl">All Docs</h2>
					<div className="mt-6 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
						{sections.map((section) => (
							<section key={section}>
								<h3 className="font-semibold text-sm uppercase tracking-normal">
									{DOCS_SECTION_LABELS[section] || section}
								</h3>
								<ul className="mt-3 space-y-2">
									{grouped[section].map((entry) => (
										<li key={entry.markdownPath}>
											<Link
												className="block rounded-md px-0 py-1 text-muted-foreground text-sm leading-6 transition-colors hover:text-foreground"
												href={entry.htmlPath}
											>
												{entry.title}
											</Link>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
