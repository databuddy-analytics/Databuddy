import { SITE_URL } from "@/app/util/constants";
import { getPosts, isPublished } from "@/lib/blog-query";

export const revalidate = 3600;

function escapeXml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export async function GET() {
	const result = await getPosts();
	if ("error" in result && !result.unconfigured) {
		throw new Error(
			`Failed to load blog posts: ${result.status} ${result.statusText}`
		);
	}
	const posts = ("error" in result ? [] : result.posts)
		.filter(isPublished)
		.sort(
			(a, b) =>
				new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
		);

	const items = posts
		.map((post) => {
			const url = `${SITE_URL}/blog/${post.slug}`;
			return [
				"<item>",
				`<title>${escapeXml(post.title)}</title>`,
				`<link>${url}</link>`,
				`<guid isPermaLink="true">${url}</guid>`,
				`<description>${escapeXml(post.description)}</description>`,
				`<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`,
				...(post.category?.name
					? [`<category>${escapeXml(post.category.name)}</category>`]
					: []),
				"</item>",
			].join("");
		})
		.join("");

	const feed = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
		"<channel>",
		"<title>Databuddy Blog</title>",
		`<link>${SITE_URL}/blog</link>`,
		"<description>Guides on product analytics, event tracking, funnels, cookieless measurement, GDPR, and Core Web Vitals from the Databuddy team.</description>",
		"<language>en</language>",
		`<atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>`,
		items,
		"</channel>",
		"</rss>",
	].join("");

	return new Response(feed, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
		},
	});
}
