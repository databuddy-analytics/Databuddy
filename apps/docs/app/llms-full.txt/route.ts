import { createHash } from "node:crypto";
import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs/promises";
import path from "node:path";

export const revalidate = false;

const HEADER = `# Databuddy Documentation (Full)

> Privacy-first web analytics. 65x faster than Google Analytics, GDPR compliant, no cookies required.
> This file contains the complete documentation corpus for long-context agents.

`;

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

	const body = HEADER + sections;

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
			ETag: `"${createHash("sha256").update(body).digest("hex").slice(0, 16)}"`,
		},
	});
}
