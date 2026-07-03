import type { Metadata } from "next";
import { SITE_URL } from "@/app/util/constants";
import { Footer } from "@/components/footer";
import { StructuredData } from "@/components/structured-data";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { developerResources } from "@/lib/agent-discovery";

const title = "Databuddy Developer Resources - API Docs, OpenAPI, MCP & SDKs";
const description =
	"Find Databuddy developer resources for agents and humans: API docs, OpenAPI spec, authentication, webhooks, MCP server, SDKs, and llms.txt.";
const url = `${SITE_URL}/developers`;

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
		images: ["/og-image.png"],
	},
};

export default function DevelopersPage() {
	const docDateIso = new Date().toISOString();

	return (
		<>
			<StructuredData
				elements={[
					{
						type: "documentation",
						value: {
							title,
							description,
							datePublished: docDateIso,
							dateModified: docDateIso,
							section: "Developer Resources",
							keywords: [
								"Databuddy developer resources",
								"Databuddy API docs",
								"Databuddy OpenAPI",
								"Databuddy MCP server",
								"Databuddy SDK",
							],
						},
					},
				]}
				page={{
					title,
					description,
					url,
				}}
			/>

			<main className="flex-1 px-4 pt-24 pb-16 sm:px-6 lg:px-8 lg:pt-32">
				<div className="mx-auto w-full max-w-6xl">
					<div className="max-w-3xl">
						<p className="font-medium text-muted-foreground text-sm uppercase">
							Agent-ready docs
						</p>
						<h1 className="mt-4 text-balance font-semibold text-4xl sm:text-5xl">
							Databuddy Developer Resources
						</h1>
						<p className="mt-5 text-lg text-muted-foreground">
							API docs, OpenAPI schema, authentication, webhooks, MCP server,
							SDK guides, and LLM-readable documentation for Databuddy.
						</p>
					</div>

					<div className="mt-12 grid gap-4 md:grid-cols-2">
						{developerResources.map((resource) => (
							<a
								className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
								href={resource.url}
								key={resource.url}
							>
								<Card className="h-full rounded transition-colors group-hover:border-primary/60">
									<CardHeader>
										<CardTitle className="text-lg">{resource.title}</CardTitle>
										<CardDescription>{resource.url}</CardDescription>
									</CardHeader>
									<CardContent>
										<p className="text-muted-foreground text-sm">
											{resource.description}
										</p>
									</CardContent>
								</Card>
							</a>
						))}
					</div>
				</div>
			</main>

			<Footer />
		</>
	);
}
