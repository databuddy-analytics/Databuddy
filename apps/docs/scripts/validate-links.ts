import { plugin } from "bun";
import { createMdxPlugin } from "fumadocs-mdx/bun";
import {
	printErrors,
	readFileFromPath,
	scanURLs,
	validateFiles,
} from "next-validate-link";
import { contents, type SidebarItem } from "../components/sidebar-content";

interface DocsPage {
	url: string;
}

function getSidebarHrefs(item: SidebarItem): string[] {
	if (item.children?.length) {
		return item.children.flatMap(getSidebarHrefs);
	}
	return item.href ? [item.href] : [];
}

function isDocsUrl(href: string): boolean {
	return href === "/docs" || href.startsWith("/docs/");
}

function checkSidebarCoverage(pages: DocsPage[]) {
	const docsUrls = new Set(pages.map((page) => page.url));
	const sidebarUrls = new Set(
		contents.flatMap((section) =>
			section.list.flatMap((item) => getSidebarHrefs(item)).filter(isDocsUrl)
		)
	);

	const missingFromSidebar = [...docsUrls]
		.filter((url) => !sidebarUrls.has(url))
		.sort();
	const brokenSidebarUrls = [...sidebarUrls]
		.filter((url) => !docsUrls.has(url))
		.sort();

	if (missingFromSidebar.length === 0 && brokenSidebarUrls.length === 0) {
		return;
	}

	throw new Error(
		[
			"Sidebar docs coverage failed.",
			missingFromSidebar.length > 0
				? `Missing from sidebar:\n${missingFromSidebar.map((url) => `  - ${url}`).join("\n")}`
				: undefined,
			brokenSidebarUrls.length > 0
				? `Sidebar links without docs pages:\n${brokenSidebarUrls.map((url) => `  - ${url}`).join("\n")}`
				: undefined,
		]
			.filter(Boolean)
			.join("\n\n")
	);
}

async function checkLinks() {
	await plugin(createMdxPlugin());
	const { source } = await import("../lib/source");
	const pages = await Promise.all(
		source.getPages().map(async (page) => ({
			file: await readFileFromPath(page.data.info.fullPath, () => page.url),
			url: page.url,
			slugs: page.slugs,
			hashes: (await page.data.load()).toc.map((item) => item.url.slice(1)),
		}))
	);
	const files = pages.map((page) => page.file);
	checkSidebarCoverage(pages);

	const scanned = await scanURLs({
		preset: "next",
		populate: {
			"docs/[[...slug]]": pages.map((page) => ({
				value: { slug: page.slugs },
				hashes: page.hashes,
			})),
		},
	});

	const errors = await validateFiles(files, {
		scanned,
		markdown: {
			components: {
				Card: { attributes: ["href"] },
				Cards: { attributes: ["href"] },
				Link: { attributes: ["href"] },
			},
		},
		checkRelativePaths: "as-url",
	});

	printErrors(errors, true);

	if (errors.length > 0) {
		process.exit(1);
	}
}

checkLinks().catch((error) => {
	console.error(error);
	process.exit(1);
});
