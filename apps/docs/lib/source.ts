import { docs } from "fumadocs-mdx:collections/server";
import { type InferPageType, loader } from "fumadocs-core/source";
import type { DocData, DocMethods } from "fumadocs-mdx/runtime/types";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

export type DocPage = InferPageType<typeof source>;

export type AsyncPageData = DocMethods & {
	title?: string;
	description?: string;
	load: () => Promise<DocData>;
};

export function getPageImage(page: DocPage) {
	const segments = [...page.slugs, "image.png"];

	return {
		segments,
		url: `/og/docs/${segments.join("/")}`,
	};
}
