import type { Metadata } from "next";
import { headers } from "next/headers";
import Bento from "@/components/bento";
import { Footer } from "@/components/footer";
import { DemoPreconnectLinks } from "@/components/landing/demo-preconnect-links";
import { Description } from "@/components/landing/description";
import FAQ from "@/components/landing/faq";
import { GridCards } from "@/components/landing/grid-cards";
import Hero from "@/components/landing/hero";
import { MidPageCta } from "@/components/landing/mid-page-cta";
import Section from "@/components/landing/section";
import Testimonials from "@/components/landing/testimonials";
import { TrustedBy } from "@/components/landing/trusted-by";
import { StructuredData } from "@/components/structured-data";
import { createAgentJson, developerResources } from "@/lib/agent-discovery";
import { getDemoEmbedBaseUrl, hostFromNextHeaders } from "@/lib/demo-embed-url";
import { homeFaqItems, homePageSeo } from "@/lib/home-seo";

export const metadata: Metadata = {
	title: homePageSeo.title,
	description: homePageSeo.description,
	alternates: {
		canonical: homePageSeo.url,
	},
	openGraph: {
		title: homePageSeo.title,
		description: homePageSeo.description,
		url: homePageSeo.url,
		type: "website",
		images: ["/og-image.png"],
	},
};

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

interface HomePageProps {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}

function AgentModeView() {
	const agent = createAgentJson();

	return (
		<main className="mx-auto w-full max-w-5xl px-4 pt-24 pb-16 sm:px-6 lg:px-8">
			<h1 className="font-semibold text-4xl">Databuddy Agent View</h1>
			<p className="mt-4 text-lg text-muted-foreground">
				Structured entrypoint for AI agents integrating Databuddy analytics,
				OpenAPI, API-key authentication, and MCP tools.
			</p>

			<section className="mt-10" id="agent-capabilities">
				<h2 className="font-semibold text-2xl">Capabilities</h2>
				<ul className="mt-4 grid gap-2 text-muted-foreground sm:grid-cols-2">
					{agent.capabilities.map((capability) => (
						<li key={capability}>{capability}</li>
					))}
				</ul>
			</section>

			<section className="mt-10" id="agent-resources">
				<h2 className="font-semibold text-2xl">Developer Resources</h2>
				<div className="mt-4 grid gap-3">
					{developerResources.map((resource) => (
						<a
							className="rounded border border-border p-4 text-sm hover:border-primary/60"
							href={resource.url}
							key={resource.url}
						>
							<span className="block font-medium text-foreground">
								{resource.title}
							</span>
							<span className="mt-1 block text-muted-foreground">
								{resource.description}
							</span>
							<span className="mt-2 block font-mono text-muted-foreground">
								{resource.url}
							</span>
						</a>
					))}
				</div>
			</section>

			<section className="mt-10" id="agent-auth">
				<h2 className="font-semibold text-2xl">Authentication</h2>
				<p className="mt-4 text-muted-foreground">
					Send a scoped Databuddy API key in <code>x-api-key</code> or{" "}
					<code>Authorization: Bearer</code>. Use <code>read:data</code> for
					analytics and request confirmation before write scopes.
				</p>
			</section>

			<section className="mt-10" id="agent-json">
				<h2 className="font-semibold text-2xl">Machine JSON</h2>
				<pre className="mt-4 overflow-x-auto rounded border border-border bg-muted/30 p-4 text-xs">
					{JSON.stringify(agent, null, 2)}
				</pre>
			</section>
		</main>
	);
}

function AgentSummary() {
	return (
		<Section
			className="border-border border-b py-12"
			customPaddings
			id="agent-summary"
		>
			<div className={container}>
				<div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
					<div>
						<h2 className="font-semibold text-2xl sm:text-3xl">
							Databuddy for agents and developers
						</h2>
					</div>
					<div className="space-y-4 text-muted-foreground">
						<p>
							Databuddy is a privacy-first analytics platform for developers. It
							combines web analytics, error tracking, Core Web Vitals, feature
							flags, short links, uptime monitoring, and automatic
							investigations in one lightweight product.
						</p>
						<p>
							AI agents can discover Databuddy through OpenAPI, llms.txt,
							auth.md, an RFC 9727 API catalog, A2A agent card, and a Streamable
							HTTP MCP server. API and MCP requests use scoped Databuddy API
							keys, so agents can answer analytics questions without
							browser-only steps.
						</p>
					</div>
				</div>
			</div>
		</Section>
	);
}

export default async function HomePage({ searchParams }: HomePageProps) {
	const params = searchParams ? await searchParams : {};
	if (firstValue(params.mode) === "agent") {
		return <AgentModeView />;
	}

	const headerList = await headers();
	const demoEmbedBaseUrl = getDemoEmbedBaseUrl(hostFromNextHeaders(headerList));

	return (
		<>
			<DemoPreconnectLinks />
			<StructuredData
				elements={[
					{
						type: "softwareApplication",
						value: {
							name: "Databuddy",
							description:
								"Privacy-first developer analytics with error tracking, web vitals, feature flags, short links, and automatic investigations in one lightweight script.",
							featureList: [
								"Privacy-first web analytics",
								"Error tracking",
								"Core Web Vitals monitoring",
								"Feature flags",
								"Short link analytics",
								"Automatic investigations",
								"REST API",
								"Model Context Protocol server",
							],
						},
					},
					{
						type: "faq",
						items: homeFaqItems,
					},
				]}
				page={{
					title: homePageSeo.title,
					description: homePageSeo.description,
					url: homePageSeo.url,
				}}
			/>
			<div className="overflow-hidden">
				<Section className="overflow-hidden" customPaddings id="hero">
					<Hero demoEmbedBaseUrl={demoEmbedBaseUrl} />
				</Section>

				<AgentSummary />

				<Section
					className="border-border border-t border-b"
					customPaddings
					id="trust"
				>
					<div className={container}>
						<TrustedBy />
					</div>
				</Section>

				<Section className="border-border border-b" id="bento">
					<div className={container}>
						<Bento />
					</div>
				</Section>

				<Section className="border-border border-b py-16 lg:py-24" id="cards">
					<div className={container}>
						<GridCards />
					</div>
				</Section>

				<Section className="border-border border-b" id="mid-cta">
					<div className={container}>
						<MidPageCta />
					</div>
				</Section>

				<Section
					className="border-border border-b bg-background/30"
					customPaddings
					id="desc-border"
				>
					<div className={container}>
						<Section className="pt-8 lg:pt-12" customPaddings id="description">
							<Description />
						</Section>

						<div className="w-full">
							<div className="h-px bg-linear-to-r from-transparent via-border to-transparent" />
						</div>

						<Section className="py-16 lg:py-20" customPaddings id="faq">
							<FAQ />
						</Section>
					</div>
				</Section>

				<Section
					className="bg-background/50 py-16 lg:py-24"
					customPaddings
					id="testimonial"
				>
					<div className={container}>
						<Testimonials />
					</div>
				</Section>

				<div className="w-full">
					<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
				</div>

				<Footer />

				<div className="w-full">
					<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
				</div>
			</div>
		</>
	);
}
