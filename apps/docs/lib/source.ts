import { docs } from "fumadocs-mdx:collections/server";
import { type InferPageType, loader } from "fumadocs-core/source";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

export type DocPage = InferPageType<typeof source>;

export function getPageImage(page: DocPage) {
	const segments = [...page.slugs, "image.png"];

	return {
		segments,
		url: `/og/docs/${segments.join("/")}`,
	};
}
