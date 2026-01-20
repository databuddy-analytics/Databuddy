import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";

export const revalidate = false;

const BASE_URL = "https://www.databuddy.cc/docs";

const HEADER = `# Databuddy Documentation

> Privacy-first web analytics. 65x faster than Google Analytics, GDPR compliant, no cookies required.

`;

const SECTION_ORDER = ["root", "api", "Integrations", "hooks", "features", "performance", "privacy", "compliance"];
const SECTION_LABELS: Record<string, string> = {
	root: "Core",
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
			const content = await fs.readFile(file);
			const { data } = matter(content.toString());
			const relativePath = file.replace("./content/docs/", "").replace(".mdx", "");
			const section = path.dirname(relativePath);

			return {
				section: section === "." ? "root" : section,
				title: data.title || path.basename(file, ".mdx"),
				description: data.description || "",
				url: `${BASE_URL}/${relativePath}.md`,
			};
		}),
	);

	const grouped = entries.reduce<Record<string, typeof entries>>((acc, entry) => {
		acc[entry.section] = acc[entry.section] || [];
		acc[entry.section].push(entry);
		return acc;
	}, {});

	const sections = SECTION_ORDER.filter((s) => grouped[s])
		.map((section) => {
			const label = SECTION_LABELS[section] || section;
			const items = grouped[section]
				.map((i) => `- [${i.title}](${i.url}): ${i.description}`)
				.join("\n");
			return `## ${label}\n${items}`;
		})
		.join("\n\n");

	return new Response(HEADER + sections, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
