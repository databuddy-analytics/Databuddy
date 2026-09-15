import { createHash } from "node:crypto";
import matter from "gray-matter";
import { developerResources } from "@/lib/agent-discovery";
import { getDocumentationSections } from "@/lib/source";

export const revalidate = false;

const HEADER = `# Databuddy Documentation (Full)

> Cookieless web analytics with events, errors, funnels, and optional user identification.
> This file contains the highest-priority documentation sections for long-context agents,
> truncated at a size limit. For the rest, use the scoped indexes at
> https://www.databuddy.cc/docs/llms.txt, https://www.databuddy.cc/api/llms.txt, and
> https://www.databuddy.cc/developers/llms.txt.

`;
const MAX_LLMS_FULL_CHARS = 190_000;

export async function GET() {
	const sections = await Promise.all(
		getDocumentationSections().map(async ({ title, pages }) => {
			const documents = await Promise.all(
				pages.map(async (page) => {
					const { content } = matter(await page.data.getText("raw"));
					const description = page.data.description
						? `> ${page.data.description}\n\n`
						: "";
					return `# ${page.data.title}\n\n${description}${content.trim()}`;
				})
			);
			return `## ${title}\n\n${documents.join("\n\n---\n\n")}`;
		})
	);

	const resourceList = developerResources
		.map(
			(resource) =>
				`- [${resource.title}](${resource.url}): ${resource.description}`
		)
		.join("\n");

	let body = `${HEADER}## Developer Resources\n${resourceList}\n\n---\n\n${sections.join("\n\n---\n\n")}`;
	if (body.length > MAX_LLMS_FULL_CHARS) {
		const notice =
			"\n\n---\n\n## Additional Documentation\n\nThis single-file agent corpus is capped below 200,000 characters for one-request ingestion. Continue with the scoped indexes at https://www.databuddy.cc/docs/llms.txt, https://www.databuddy.cc/api/llms.txt, and https://www.databuddy.cc/developers/llms.txt.\n";
		body = `${body.slice(0, MAX_LLMS_FULL_CHARS - notice.length).trimEnd()}${notice}`;
	}

	return new Response(body, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
			ETag: `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`,
		},
	});
}
