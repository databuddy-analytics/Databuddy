import {
	defineConfig,
	defineDocs,
	frontmatterSchema,
	metaSchema,
} from 'fumadocs-mdx/config';
import { z } from 'zod';

// Simplified blog frontmatter schema - separate from docs schema
const blogFrontmatterSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	icon: z.string().optional(),
	full: z.boolean().optional(),
	author: z.string(),
	publishedAt: z.string(),
	lastModified: z.string().optional(),
	featured: z.boolean().optional().default(false),
	category: z.string(),
	tags: z.array(z.string()).optional().default([]),
});

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.vercel.app/docs/mdx/collections#define-docs
export const docs = defineDocs({
	dir: 'content/docs',
	docs: {
		schema: frontmatterSchema,
	},
	meta: {
		schema: metaSchema,
	},
});

export const blogs = defineDocs({
	dir: 'content/blogs',
	docs: {
		schema: blogFrontmatterSchema,
	},
	meta: {
		schema: metaSchema,
	},
});

export default defineConfig({
	lastModifiedTime: 'git',
	mdxOptions: {
		// MDX options
	},
});
