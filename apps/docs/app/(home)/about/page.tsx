import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";

const title = "About Databuddy";
const description =
	"Learn about Databuddy, the privacy-first analytics platform for developers building fast, compliant, agent-ready product analytics.";
const url = "https://www.databuddy.cc/about";

export const metadata: Metadata = {
	title,
	description,
	alternates: {
		canonical: url,
	},
	openGraph: {
		title,
		description,
		url,
		type: "website",
		images: ["/og-image.png"],
	},
};

export default function AboutPage() {
	return (
		<>
			<StructuredData
				elements={[
					{
						type: "documentation",
						value: {
							title,
							description,
							datePublished: new Date("2026-07-03").toISOString(),
							dateModified: new Date("2026-07-03").toISOString(),
							section: "Company",
							keywords: [
								"Databuddy",
								"privacy-first analytics",
								"developer analytics",
								"agent-ready analytics",
							],
						},
					},
				]}
				page={{ title, description, url }}
			/>
			<main className="flex-1">
				<Section
					className="px-4 pt-24 pb-16 sm:px-6 lg:px-8 lg:pt-32"
					id="about"
				>
					<div className="mx-auto max-w-4xl">
						<p className="font-medium text-muted-foreground text-sm uppercase">
							Company
						</p>
						<h1 className="mt-4 text-balance font-semibold text-4xl sm:text-5xl">
							About Databuddy
						</h1>
						<div className="mt-8 space-y-5 text-lg text-muted-foreground">
							<p>
								Databuddy builds privacy-first analytics for developer teams
								that want useful product data without turning their websites
								into surveillance systems. The platform brings website
								analytics, error tracking, Core Web Vitals, feature flags, short
								links, uptime monitoring, and automatic findings into one
								product with a small client footprint and a clear API surface.
							</p>
							<p>
								The product is designed for teams that care about speed,
								compliance, and operational clarity. Databuddy avoids cookies
								and fingerprinting by default, keeps analytics focused on
								aggregate behavior, and gives teams the tools they need to
								understand pages, referrers, events, errors, funnels, goals, and
								performance.
							</p>
							<p>
								Databuddy is also built for agent workflows. Developers and AI
								agents can use markdown documentation, llms.txt, OpenAPI,
								API-key authentication, an RFC 9727 API catalog, and a
								Streamable HTTP MCP server to discover capabilities and answer
								analytics questions programmatically. The same platform remains
								usable by humans through the dashboard, docs, public demo, and
								support channels.
							</p>
						</div>
					</div>
				</Section>
			</main>
			<Footer />
		</>
	);
}
