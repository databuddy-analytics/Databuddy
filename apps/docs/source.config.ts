import { defineDocs, frontmatterSchema, metaSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
	dir: "content/docs",
	docs: {
		schema: frontmatterSchema.extend({
			seoTitle: z.string().optional(),
		}),
		async: true,
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
	meta: {
		schema: metaSchema,
	},
});
