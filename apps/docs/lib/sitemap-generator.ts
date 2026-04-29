import { SITE_URL } from "@/app/util/constants";
import { getPosts } from "@/lib/blog-query";
import { getAllCompetitorSlugs } from "@/lib/comparison-config";
import { source } from "@/lib/source";
import type { MetadataRoute } from "next";

const exactPriority: Record<string, number> = {
	"/": 1.0,
	"/docs": 0.9,
	"/compare": 0.9,
	"/alternatives": 0.84,
	"/switch-from": 0.84,
	"/pricing": 0.8,
	"/calculator": 0.85,
	"/demo": 0.8,
	"/contact": 0.6,
	"/blog": 0.8,
	"/changelog": 0.7,
	"/api": 0.7,
	"/uptime": 0.85,
	"/errors": 0.85,
	"/web-vitals": 0.85,
	"/feature-flags": 0.85,
	"/links": 0.85,
	"/databunny": 0.85,
	"/roadmap": 0.6,
	"/manifesto": 0.65,
	"/sponsors": 0.6,
	"/ambassadors": 0.6,
	"/careers": 0.6,
	"/contributors": 0.8,
	"/privacy": 0.5,
	"/terms": 0.5,
	"/data-policy": 0.5,
	"/dpa": 0.5,
};

const prefixPriority: Array<{ prefix: string; priority: number }> = [
	{ prefix: "/docs/getting-started", priority: 0.9 },
	{ prefix: "/docs/sdk", priority: 0.9 },
	{ prefix: "/docs/compliance/gdpr", priority: 0.85 },
	{ prefix: "/docs/performance/core-web-vitals", priority: 0.85 },
	{ prefix: "/docs/Integrations/react", priority: 0.8 },
	{ prefix: "/docs/Integrations/nextjs", priority: 0.8 },
	{ prefix: "/docs/dashboard", priority: 0.8 },
	{ prefix: "/docs/security", priority: 0.8 },
	{ prefix: "/compare/", priority: 0.85 },
	{ prefix: "/alternatives/", priority: 0.83 },
	{ prefix: "/switch-from/", priority: 0.83 },
	{ prefix: "/docs/Integrations/", priority: 0.7 },
	{ prefix: "/blog/", priority: 0.7 },
	{ prefix: "/docs/", priority: 0.6 },
];

function getPriority(url: string): number {
	if (url in exactPriority) {
		return exactPriority[url];
	}
	for (const rule of prefixPriority) {
		if (url.startsWith(rule.prefix)) {
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
		url.includes("/ambassadors") ||
		url.includes("/careers")
	) {
		return "monthly";
	}
	return "weekly";
}

export async function generateSitemapEntries(): Promise<MetadataRoute.Sitemap> {
	if (process.env.NODE_ENV === "development") {
		return [];
	}

	const entries: MetadataRoute.Sitemap = [];

	try {
		const competitorSlugs = getAllCompetitorSlugs();
		entries.push({
			url: `${SITE_URL}/compare`,
			changeFrequency: "monthly",
			priority: getPriority("/compare"),
		});
		entries.push(
			...competitorSlugs.map((slug) => ({
				url: `${SITE_URL}/compare/${slug}`,
				changeFrequency: "monthly" as const,
				priority: getPriority(`/compare/${slug}`),
			}))
		);

		entries.push({
			url: `${SITE_URL}/alternatives`,
			changeFrequency: "monthly",
			priority: getPriority("/alternatives"),
		});
		entries.push({
			url: `${SITE_URL}/switch-from`,
			changeFrequency: "monthly",
			priority: getPriority("/switch-from"),
		});
		entries.push(
			...competitorSlugs.map((slug) => ({
				url: `${SITE_URL}/alternatives/${slug}`,
				changeFrequency: "monthly" as const,
				priority: getPriority(`/alternatives/${slug}`),
			}))
		);
		entries.push(
			...competitorSlugs.map((slug) => ({
				url: `${SITE_URL}/switch-from/${slug}`,
				changeFrequency: "monthly" as const,
				priority: getPriority(`/switch-from/${slug}`),
			}))
		);

		const pages = source.getPages();
		entries.push(
			...pages.map((page) => ({
				url: `${SITE_URL}${page.url}`,
				changeFrequency: getChangeFrequency(page.url),
				priority: getPriority(page.url),
			}))
		);

		// Add static pages that actually exist (/compare already emitted above)
		const staticPages = [
			"/",
			"/uptime",
			"/errors",
			"/web-vitals",
			"/feature-flags",
			"/links",
			"/databunny",
			"/demo",
			"/contact",
			"/pricing",
			"/calculator",
			"/privacy",
			"/api",
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
		];
		entries.push(
			...staticPages.map((page) => ({
				url: `${SITE_URL}${page}`,
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
					: new Date();

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
			changeFrequency: "weekly",
			priority: 0.9,
		});
	}

	return entries;
}
