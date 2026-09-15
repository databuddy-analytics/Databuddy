import { createHash } from "node:crypto";
import { developerResources } from "@/lib/agent-discovery";
import { getDocumentationSections } from "@/lib/source";

export const revalidate = false;

const BASE_URL = "https://www.databuddy.cc/docs";

const HEADER = `# Databuddy Documentation

> Cookieless web analytics with events, errors, funnels, and optional user identification.
> For the full documentation corpus, see [llms-full.txt](https://www.databuddy.cc/llms-full.txt).

`;

export function GET() {
	const sections = getDocumentationSections()
		.map(({ title, pages }) => {
			const items = pages
				.map(
					(page) =>
						`- [${page.data.title}](${BASE_URL}/${page.file.flattenedPath}.md): ${page.data.description || ""}`
				)
				.join("\n");
			return `## ${title}\n${items}`;
		})
		.join("\n\n");

	const resourceList = developerResources
		.map(
			(resource) =>
				`- [${resource.title}](${resource.url}): ${resource.description}`
		)
		.join("\n");

	const body = `${HEADER}## Developer Resources\n${resourceList}\n\n${sections}`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
			ETag: `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`,
		},
	});
}
