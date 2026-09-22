import type { MetadataRoute } from "next";
import { SITE_URL } from "@/app/util/constants";
import { getPostModifiedAt, getPosts, isPublished } from "@/lib/blog-query";
import { getAllCompetitorSlugs } from "@/lib/comparison-config";
import { source } from "@/lib/source";

export async function generateSitemapEntries(): Promise<MetadataRoute.Sitemap> {
	if (process.env.NODE_ENV === "development") {
		return [];
	}

	const paths = [
		"/",
		"/uptime",
		"/errors",
		"/web-vitals",
		"/feature-flags",
		"/links",
		"/databunny",
		"/demo",
		"/about",
		"/contact",
		"/developers",
		"/pricing",
		"/calculator",
		"/privacy",
		"/api",
		"/blog",
		"/changelog",
		"/contributors",
		"/roadmap",
		"/manifesto",
		"/sponsors",
		"/terms",
		"/ambassadors",
		"/careers",
		"/data-policy",
		"/dpa",
		"/oss",
		"/branding",
		...source.getPages().map((page) => page.url),
		"/compare",
		...getAllCompetitorSlugs().map((slug) => `/compare/${slug}`),
	];
	const entries: MetadataRoute.Sitemap = paths.map((path) => ({
		url: `${SITE_URL}${path}`,
	}));

	const blogData = await getPosts();
	if (!("error" in blogData)) {
		entries.push(
			...blogData.posts.filter(isPublished).map((post) => ({
				url: `${SITE_URL}/blog/${post.slug}`,
				lastModified: getPostModifiedAt(post),
			}))
		);
	}

	return entries;
}
