import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs/promises";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "content/docs");
const DOCS_GLOB = "./content/docs/**/*.mdx";
const LEADING_SLASHES_REGEX = /^\/+/;
const MARKDOWN_EXTENSION_REGEX = /\.md$/;
const MDX_EXTENSION_REGEX = /\.mdx$/;
const TRAILING_SLASH_REGEX = /\/$/;

export const DOCS_SECTION_ORDER = [
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

export const DOCS_SECTION_LABELS: Record<string, string> = {
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

export interface DocsEntry {
	description: string;
	htmlPath: string;
	markdownPath: string;
	section: string;
	slug: string[];
	title: string;
}

export interface RawDoc {
	body: string;
	description: string;
	filePath: string;
	slug: string[];
	title: string;
}

function normalizeOrigin(origin: string): string {
	return origin.replace(TRAILING_SLASH_REGEX, "");
}

function pathFromSlug(slug: string[]): string {
	return slug.join("/");
}

function normalizeSlugFromRelativePath(relativePath: string): string[] {
	const withoutExtension = relativePath.replace(MDX_EXTENSION_REGEX, "");
	const segments = withoutExtension.split("/").filter(Boolean);

	if (segments.length === 1 && segments[0] === "index") {
		return [];
	}

	if (segments.at(-1) === "index") {
		return segments.slice(0, -1);
	}

	return segments;
}

function sectionFromRelativePath(relativePath: string): string {
	const segments = relativePath
		.replace(MDX_EXTENSION_REGEX, "")
		.split("/")
		.filter(Boolean);
	return segments.length > 1 ? segments[0] : "root";
}

function sectionRank(section: string): number {
	const rank = DOCS_SECTION_ORDER.indexOf(section);
	return rank === -1 ? DOCS_SECTION_ORDER.length : rank;
}

function compareDocsEntry(a: DocsEntry, b: DocsEntry): number {
	const sectionDelta = sectionRank(a.section) - sectionRank(b.section);
	if (sectionDelta !== 0) {
		return sectionDelta;
	}
	if (a.slug.length === 0) {
		return -1;
	}
	if (b.slug.length === 0) {
		return 1;
	}
	return a.title.localeCompare(b.title);
}

function relativePathFromFile(file: string): string {
	return file.replace("./content/docs/", "");
}

export function docsPathForSlug(slug: string[]): string {
	return slug.length === 0 ? "/docs" : `/docs/${pathFromSlug(slug)}`;
}

export function markdownPathForSlug(slug: string[]): string {
	return slug.length === 0 ? "/docs.md" : `/docs/${pathFromSlug(slug)}.md`;
}

export function groupDocsBySection<T extends { section: string }>(
	entries: T[]
) {
	return entries.reduce<Record<string, T[]>>((acc, entry) => {
		acc[entry.section] = acc[entry.section] || [];
		acc[entry.section].push(entry);
		return acc;
	}, {});
}

export function orderedSectionKeys(grouped: Record<string, DocsEntry[]>) {
	const known = DOCS_SECTION_ORDER.filter((section) => grouped[section]);
	const unknown = Object.keys(grouped)
		.filter((section) => !DOCS_SECTION_ORDER.includes(section))
		.sort((a, b) => a.localeCompare(b));
	return [...known, ...unknown];
}

export async function listDocs(): Promise<DocsEntry[]> {
	const files = await fg([DOCS_GLOB]);

	const entries = await Promise.all(
		files.map(async (file) => {
			const raw = await fs.readFile(file, "utf-8");
			const { data } = matter(raw);
			const relativePath = relativePathFromFile(file);
			const slug = normalizeSlugFromRelativePath(relativePath);

			return {
				description: data.description || "",
				htmlPath: docsPathForSlug(slug),
				markdownPath: markdownPathForSlug(slug),
				section: sectionFromRelativePath(relativePath),
				slug,
				title: data.title || path.basename(file, ".mdx"),
			};
		})
	);

	return entries.sort(compareDocsEntry);
}

function safeSlugSegments(slug: string[]): string[] | null {
	const clean = slug
		.flatMap((segment) => segment.split("/"))
		.map((segment) => segment.replace(MARKDOWN_EXTENSION_REGEX, ""))
		.filter(Boolean);

	if (
		clean.some(
			(segment) =>
				segment === "." ||
				segment === ".." ||
				segment.includes("\\") ||
				path.isAbsolute(segment)
		)
	) {
		return null;
	}

	if (clean.length === 1 && clean[0] === "index") {
		return [];
	}

	if (clean.at(-1) === "index") {
		return clean.slice(0, -1);
	}

	return clean;
}

function candidatePathsForSlug(slug: string[]) {
	if (slug.length === 0) {
		return [path.join(DOCS_DIR, "index.mdx")];
	}

	const slugPath = path.join(...slug);
	return [
		path.join(DOCS_DIR, `${slugPath}.mdx`),
		path.join(DOCS_DIR, slugPath, "index.mdx"),
	];
}

function isInsideDocsDir(filePath: string): boolean {
	const relative = path.relative(DOCS_DIR, filePath);
	return (
		Boolean(relative) &&
		!relative.startsWith("..") &&
		!path.isAbsolute(relative)
	);
}

export function slugFromDocsPath(value: string): string[] | null {
	let pathname = value.trim();
	if (!pathname) {
		return [];
	}

	try {
		if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
			pathname = new URL(pathname).pathname;
		}
	} catch {
		return null;
	}

	pathname = pathname.replace(LEADING_SLASHES_REGEX, "");
	if (pathname === "docs" || pathname === "docs.md") {
		return [];
	}
	if (pathname.startsWith("docs/")) {
		pathname = pathname.slice("docs/".length);
	}

	return safeSlugSegments(pathname.split("/"));
}

export async function readDocMarkdown(slug: string[]): Promise<RawDoc | null> {
	const cleanSlug = safeSlugSegments(slug);
	if (!cleanSlug) {
		return null;
	}

	for (const filePath of candidatePathsForSlug(cleanSlug)) {
		const resolved = path.resolve(filePath);
		if (!isInsideDocsDir(resolved)) {
			continue;
		}

		try {
			const raw = await fs.readFile(resolved, "utf-8");
			const { content, data } = matter(raw);
			const title = data.title || path.basename(resolved, ".mdx");
			const description = data.description || "";
			const header = title ? `# ${title}\n\n` : "";
			const desc = description ? `> ${description}\n\n` : "";

			return {
				body: `${header}${desc}${content.trim()}\n`,
				description,
				filePath: resolved,
				slug: cleanSlug,
				title,
			};
		} catch {
			// Try the next canonical docs filename.
		}
	}

	return null;
}

export async function buildLlmsTxt(origin: string) {
	const baseUrl = normalizeOrigin(origin);
	const entries = await listDocs();
	const grouped = groupDocsBySection(entries);
	const sections = orderedSectionKeys(grouped)
		.map((section) => {
			const label = DOCS_SECTION_LABELS[section] || section;
			const items = grouped[section]
				.map((entry) => {
					const description = entry.description ? `: ${entry.description}` : "";
					return `- [${entry.title}](${baseUrl}${entry.markdownPath})${description}`;
				})
				.join("\n");
			return `## ${label}\n${items}`;
		})
		.join("\n\n");

	return `# Databuddy Documentation

> Privacy-first web analytics. 65x faster than Google Analytics, GDPR compliant, no cookies required.
> For the full documentation corpus, see [llms-full.txt](${baseUrl}/llms-full.txt).
> For tool-based agents, connect to the read-only Databuddy docs MCP server at ${baseUrl}/mcp.

${sections}
`;
}

export async function buildLlmsFullTxt() {
	const entries = await listDocs();
	const docs = await Promise.all(
		entries.map(async (entry) => {
			const doc = await readDocMarkdown(entry.slug);
			return doc
				? {
						...entry,
						body: doc.body,
					}
				: null;
		})
	);

	const grouped = groupDocsBySection(docs.filter((doc) => doc !== null));
	const sections = orderedSectionKeys(grouped)
		.map((section) => {
			const label = DOCS_SECTION_LABELS[section] || section;
			const sectionDocs = grouped[section]
				.map((entry) => entry.body.trim())
				.join("\n\n---\n\n");
			return `## ${label}\n\n${sectionDocs}`;
		})
		.join("\n\n---\n\n");

	return `# Databuddy Documentation (Full)

> Privacy-first web analytics. 65x faster than Google Analytics, GDPR compliant, no cookies required.
> This file contains the complete documentation corpus for long-context agents.

${sections}
`;
}

export function markdownHeaders(body: string) {
	return {
		"Cache-Control": "public, max-age=3600, must-revalidate",
		"Content-Type": "text/markdown; charset=utf-8",
		ETag: `"${Buffer.from(body).length.toString(36)}"`,
		Vary: "Accept",
	};
}
