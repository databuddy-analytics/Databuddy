import type { Metadata } from "next";
import { createAgentJson, developerResources } from "@/lib/agent-discovery";
import { homePageSeo } from "@/lib/home-seo";

export const metadata: Metadata = {
	title: { absolute: "Databuddy Agent View" },
	description:
		"Structured entrypoint for AI agents integrating Databuddy analytics, OpenAPI, API-key authentication, and MCP tools.",
	alternates: {
		canonical: homePageSeo.url,
	},
	robots: {
		index: false,
		follow: true,
	},
};

export default function AgentViewPage() {
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
					MCP clients that support OAuth sign-in, such as Claude and Claude
					Code, connect with a Databuddy account and the user approves access.
					REST API calls and other MCP clients send a scoped Databuddy API key
					in <code>x-api-key</code> or <code>Authorization: Bearer</code>. Use{" "}
					<code>read:data</code> for analytics and request confirmation before
					write scopes.
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
