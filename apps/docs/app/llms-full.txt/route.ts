import { createHash } from "node:crypto";
import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs/promises";
import path from "node:path";
import { developerResources } from "@/lib/agent-discovery";

export const revalidate = false;

const HEADER = `# Databuddy Documentation (Full)

> Privacy-first web analytics. 65x faster than Google Analytics, GDPR compliant, no cookies required.
> This file contains the complete documentation corpus for long-context agents.

`;
const MAX_LLMS_FULL_CHARS = 190_000;

const SECTION_ORDER = [
	"root",
	"sdk",
	"api",
	"Integrations",
	"hooks",
	"features",
	"performance",
	"privacy",
	"compliance",
];
const SECTION_LABELS: Record<string, string> = {
	root: "Core",
	sdk: "SDK",
	api: "API Reference",
	Integrations: "Integrations",
	hooks: "React Hooks",
	features: "Features",
	performance: "Performance",
	privacy: "Privacy",
	compliance: "Compliance",
};

export async function GET() {
	const files = await fg(["./content/docs/**/*.mdx"]);

	const entries = await Promise.all(
		files.map(async (file) => {
			const raw = await fs.readFile(file, "utf-8");
			const { content, data } = matter(raw);
			const relativePath = file
				.replace("./content/docs/", "")
				.replace(".mdx", "");
			const section = path.dirname(relativePath);
			const title = data.title || path.basename(file, ".mdx");
			const description = data.description || "";

			const header = `# ${title}\n\n`;
			const desc = description ? `> ${description}\n\n` : "";

			return {
				section: section === "." ? "root" : section,
				title,
				body: header + desc + content.trim(),
			};
		})
	);

	const grouped = entries.reduce<Record<string, typeof entries>>(
		(acc, entry) => {
			acc[entry.section] = acc[entry.section] || [];
			acc[entry.section].push(entry);
			return acc;
		},
		{}
	);

	const sections = SECTION_ORDER.filter((s) => grouped[s])
		.map((section) => {
			const label = SECTION_LABELS[section] || section;
			const docs = grouped[section].map((e) => e.body).join("\n\n---\n\n");
			return `## ${label}\n\n${docs}`;
		})
		.join("\n\n---\n\n");

	const resourceList = developerResources
		.map(
			(resource) =>
				`- [${resource.title}](${resource.url}): ${resource.description}`
		)
		.join("\n");

	let body = `${HEADER}## Developer Resources\n${resourceList}\n\n---\n\n${sections}`;
	if (body.length > MAX_LLMS_FULL_CHARS) {
		const notice = `\n\n---\n\n## Additional Documentation\n\nThis single-file agent corpus is capped below 200,000 characters for one-request ingestion. Continue with the scoped indexes at https://www.databuddy.cc/docs/llms.txt, https://www.databuddy.cc/api/llms.txt, and https://www.databuddy.cc/developers/llms.txt.\n`;
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
