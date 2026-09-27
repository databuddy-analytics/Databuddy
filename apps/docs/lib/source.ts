import { docs } from "fumadocs-mdx:collections/server";
import { type InferPageType, loader } from "fumadocs-core/source";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

export type DocPage = InferPageType<typeof source>;

export function getDocumentationSections() {
	const pages = source.getPages();
	return Object.entries({
		"": "Core",
		sdk: "SDK",
		api: "API Reference",
		Integrations: "Integrations",
		hooks: "React Hooks",
		performance: "Performance",
		privacy: "Privacy",
		compliance: "Compliance",
	})
		.map(([directory, title]) => ({
			title,
			pages: pages.filter((page) => page.file.dirname === directory),
		}))
		.filter((section) => section.pages.length > 0);
}

export function getPageImage(page: DocPage) {
	const segments = [...page.slugs, "image.png"];

	return {
		segments,
		url: `/og/docs/${segments.join("/")}`,
	};
}
