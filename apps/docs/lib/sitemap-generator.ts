import { SITE_URL } from "@/app/util/constants";
import { getPosts } from "@/lib/blog-query";
import { getAllCompetitorSlugs } from "@/lib/comparison-config";
import { source } from "@/lib/source";
import type { MetadataRoute } from "next";

const priorityRules = [
	{ pattern: "/", priority: 1.0 },
	{ pattern: "/docs", priority: 1.0 },
	{ pattern: "/compare/", priority: 0.85 },
	{ pattern: "/compare", priority: 0.9 },
	{ pattern: "/alternatives/", priority: 0.83 },
	{ pattern: "/alternatives", priority: 0.84 },
	{ pattern: "/switch-from/", priority: 0.83 },
	{ pattern: "/switch-from", priority: 0.84 },

	{ pattern: "/getting-started", priority: 0.9 },
	{ pattern: "/sdk", priority: 0.9 },
	{ pattern: "/compliance/gdpr", priority: 0.85 },
	{ pattern: "/performance/core-web-vitals", priority: 0.85 },
	{ pattern: "/Integrations/react", priority: 0.8 },
	{ pattern: "/Integrations/nextjs", priority: 0.8 },
	{ pattern: "/dashboard", priority: 0.8 },
	{ pattern: "/security", priority: 0.8 },
	{ pattern: "/contributors", priority: 0.8 },
	{ pattern: "/pricing", priority: 0.8 },
	{ pattern: "/calculator", priority: 0.85 },
	{ pattern: "/Integrations/", priority: 0.7 },
	{ pattern: "/blog", priority: 0.7 },
	{ pattern: "/changelog", priority: 0.7 },
	{ pattern: "/api", priority: 0.7 },
	{ pattern: "/roadmap", priority: 0.6 },
	{ pattern: "/manifesto", priority: 0.65 },
	{ pattern: "/sponsors", priority: 0.6 },
	{ pattern: "/ambassadors", priority: 0.6 },
	{ pattern: "/privacy", priority: 0.5 },
	{ pattern: "/terms", priority: 0.5 },
	{ pattern: "/data-policy", priority: 0.5 },
	{ pattern: "/dpa", priority: 0.5 },
	{ pattern: "/llms.txt", priority: 0.4 },
];

function getPriority(url: string): number {
	for (const rule of priorityRules) {
		if (
			url === rule.pattern ||
			(rule.pattern !== url && url.includes(rule.pattern))
		) {
			return rule.priority;
		}
	}
	return 0.6;
}

// Simple change frequency rules
function getChangeFrequency(url: string): "weekly" | "monthly" | "yearly" {
	if (
		url.includes("/privacy") ||
		url.includes("/terms") ||
		url.includes("/data-policy") ||
		url.includes("/dpa")
	) {
		return "yearly";
	}
	if (
		url.includes("/compliance/") ||
		url.includes("/performance/") ||
		url.includes("/security")
	) {
		return "monthly";
	}
	if (url.includes("/api") && !url.includes("/api-keys")) {
		return "monthly";
	}
	if (url.includes("/blog") && url !== "/blog") {
		return "monthly";
	}
	if (url.includes("/changelog")) {
		return "weekly";
	}
	if (
		url.includes("/pricing") ||
		url.includes("/calculator") ||
		url.includes("/roadmap") ||
		url.includes("/manifesto")
	) {
		return "monthly";
	}
	if (
		url.includes("/contributors") ||
		url.includes("/sponsors") ||
		url.includes("/ambassadors")
	) {
		return "monthly";
	}
	return "weekly";
}

export async function generateSitemapEntries(): Promise<MetadataRoute.Sitemap> {
	if (process.env.NODE_ENV === "development") {
		return [];
	}

	const lastModified = new Date();
	const entries: MetadataRoute.Sitemap = [];

	try {
		const competitorSlugs = getAllCompetitorSlugs();
		entries.push({
			url: `${SITE_URL}/compare`,
			lastModified,
			changeFrequency: "monthly",
			priority: getPriority("/compare"),
		});
		entries.push(
			...competitorSlugs.map((slug) => ({
				url: `${SITE_URL}/compare/${slug}`,
				lastModified,
				changeFrequency: "monthly" as const,
				priority: getPriority(`/compare/${slug}`),
			}))
		);

		entries.push({
			url: `${SITE_URL}/alternatives`,
			lastModified,
			changeFrequency: "monthly",
			priority: getPriority("/alternatives"),
		});
		entries.push({
			url: `${SITE_URL}/switch-from`,
			lastModified,
			changeFrequency: "monthly",
			priority: getPriority("/switch-from"),
		});
		entries.push(
			...competitorSlugs.map((slug) => ({
				url: `${SITE_URL}/alternatives/${slug}`,
				lastModified,
				changeFrequency: "monthly" as const,
				priority: getPriority(`/alternatives/${slug}`),
			}))
		);
		entries.push(
			...competitorSlugs.map((slug) => ({
				url: `${SITE_URL}/switch-from/${slug}`,
				lastModified,
				changeFrequency: "monthly" as const,
				priority: getPriority(`/switch-from/${slug}`),
			}))
		);

		// Get all documentation pages from source
		const pages = source.getPages();
		entries.push(
			...pages.map((page) => ({
				url: `${SITE_URL}${page.url}`,
				lastModified,
				changeFrequency: getChangeFrequency(page.url),
				priority: getPriority(page.url),
			}))
		);

		// Add static pages that actually exist (/compare already emitted above)
		const staticPages = [
			"/privacy",
			"/llms.txt",
			"/api",
			"/changelog",
			"/contributors",
			"/pricing",
			"/calculator",
			"/roadmap",
			"/manifesto",
			"/sponsors",
			"/terms",
			"/ambassadors",
			"/data-policy",
			"/dpa",
		];
		entries.push(
			...staticPages.map((page) => ({
				url: `${SITE_URL}${page}`,
				lastModified,
				changeFrequency: getChangeFrequency(page),
				priority: getPriority(page),
			}))
		);

		// Add blog posts and blog index
		const blogData = await getPosts();
		if (!("error" in blogData) && blogData?.posts) {
			const blogEntries = blogData.posts.map((post) => ({
				url: `${SITE_URL}/blog/${post.slug}`,
				lastModified: new Date(post.publishedAt),
				changeFrequency: "monthly" as const,
				priority: 0.7,
			}));
			entries.push(...blogEntries);

			// Add blog index with latest post date
			const latestPostDate =
				blogEntries.length > 0
					? blogEntries.reduce(
							(latest, entry) =>
								entry.lastModified > latest ? entry.lastModified : latest,
							blogEntries[0].lastModified
						)
					: lastModified;

			entries.push({
				url: `${SITE_URL}/blog`,
				lastModified: latestPostDate,
				changeFrequency: "monthly",
				priority: 0.8,
			});
		}
	} catch (error) {
		console.warn("Sitemap generation failed, using minimal fallback:", error);
		entries.push({
			url: `${SITE_URL}/docs`,
			lastModified,
			changeFrequency: "weekly",
			priority: 1.0,
		});
	}

	return entries;
}
