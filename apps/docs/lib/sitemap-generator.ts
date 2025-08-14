import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/app/util/constants';
import { getPosts } from '@/lib/blog-query';
import { source } from '@/lib/source';

// Regex pattern for matching integration pages
const integrationPattern = /\/docs\/Integrations\/(.+)/;

// Priority mapping for different page types
const priorityMap: Record<string, number> = {
	'/docs': 1.0,
	'/docs/getting-started': 0.9,
	'/docs/sdk': 0.9,
	'/docs/comparisons/databuddy-vs-google-analytics': 0.95,
	'/docs/compliance/gdpr-compliance-guide': 0.9,
	'/docs/performance/core-web-vitals-guide': 0.85,
	'/docs/domain-verification': 0.8,
	'/docs/dashboard': 0.8,
	'/docs/security': 0.8,
	'/docs/Integrations': 0.8,
	'/docs/api': 0.7,
	'/blog': 0.8,
	'/api': 0.7,
	'/contributors': 0.8,
	'/privacy': 0.5,
	'/demo': 0.6,
	'/llms.txt': 0.4,
};

// Change frequency mapping
const changeFrequencyMap: Record<string, 'weekly' | 'monthly' | 'yearly'> = {
	'/docs': 'weekly',
	'/docs/getting-started': 'weekly',
	'/docs/sdk': 'weekly',
	'/docs/comparisons/databuddy-vs-google-analytics': 'monthly',
	'/docs/compliance/gdpr-compliance-guide': 'monthly',
	'/docs/performance/core-web-vitals-guide': 'monthly',
	'/docs/domain-verification': 'monthly',
	'/docs/dashboard': 'weekly',
	'/docs/security': 'monthly',
	'/docs/Integrations': 'weekly',
	'/docs/api': 'monthly',
	'/blog': 'monthly',
	'/api': 'monthly',
	'/contributors': 'monthly',
	'/privacy': 'yearly',
	'/demo': 'monthly',
	'/llms.txt': 'weekly',
};

function getPriority(url: string): number {
	return priorityMap[url] || (url.includes('/Integrations/') ? 0.7 : 0.6);
}

function getChangeFrequency(url: string): 'weekly' | 'monthly' | 'yearly' {
	return changeFrequencyMap[url] || 'weekly';
}

function createSitemapEntry(
	url: string,
	baseUrl: string,
	lastModified: Date,
	priority?: number,
	changeFrequency?: 'weekly' | 'monthly' | 'yearly'
): MetadataRoute.Sitemap[0] {
	return {
		url: `${baseUrl}${url}`,
		lastModified,
		changeFrequency: changeFrequency || getChangeFrequency(url),
		priority: priority || getPriority(url),
	};
}

function processIntegrationPages(entries: MetadataRoute.Sitemap): void {
	for (const entry of entries) {
		const match = entry.url.match(integrationPattern);
		if (match) {
			const integrationName = match[1];
			if (integrationName === 'react' || integrationName === 'nextjs') {
				entry.priority = 0.8;
			}
		}
	}
}

function processSourcePages(
	pages: Array<{ url: string }>,
	baseUrl: string,
	lastModified: Date
): MetadataRoute.Sitemap {
	return pages.map((page) =>
		createSitemapEntry(page.url, baseUrl, lastModified)
	);
}

function processNonDocPages(
	pages: string[],
	baseUrl: string,
	lastModified: Date
): MetadataRoute.Sitemap {
	return pages.map((page) =>
		createSitemapEntry(page, baseUrl, lastModified, 0.5, 'yearly')
	);
}

function processBlogPages(baseUrl: string): Promise<MetadataRoute.Sitemap> {
	return getPosts()
		.then((data) => {
			if ('error' in data || !data?.posts) {
				return [];
			}

			return data.posts.map((post) => ({
				url: `${baseUrl}/blog/${post.slug}`,
				lastModified: new Date(post.publishedAt),
				changeFrequency: 'monthly' as const,
				priority: 0.8,
			}));
		})
		.catch((error) => {
			console.warn('Failed to fetch blog posts for sitemap:', error);
			return [];
		});
}

function getFallbackEntries(): Array<{
	url: string;
	priority: number;
	changeFrequency: 'weekly' | 'monthly' | 'yearly';
}> {
	return [
		{ url: '/docs', priority: 1.0, changeFrequency: 'weekly' },
		{ url: '/docs/getting-started', priority: 0.9, changeFrequency: 'weekly' },
		{ url: '/docs/sdk', priority: 0.9, changeFrequency: 'weekly' },
		{
			url: '/docs/domain-verification',
			priority: 0.8,
			changeFrequency: 'monthly',
		},
		{ url: '/docs/dashboard', priority: 0.8, changeFrequency: 'weekly' },
		{ url: '/docs/security', priority: 0.8, changeFrequency: 'monthly' },
		{ url: '/docs/api', priority: 0.7, changeFrequency: 'monthly' },
		{ url: '/docs/Integrations', priority: 0.8, changeFrequency: 'weekly' },
		{
			url: '/docs/Integrations/react',
			priority: 0.8,
			changeFrequency: 'weekly',
		},
		{
			url: '/docs/Integrations/nextjs',
			priority: 0.8,
			changeFrequency: 'weekly',
		},
		{
			url: '/docs/Integrations/wordpress',
			priority: 0.8,
			changeFrequency: 'weekly',
		},
		{
			url: '/docs/Integrations/shopify',
			priority: 0.8,
			changeFrequency: 'weekly',
		},
		{
			url: '/docs/Integrations/stripe',
			priority: 0.8,
			changeFrequency: 'weekly',
		},
		{
			url: '/docs/Integrations/framer',
			priority: 0.7,
			changeFrequency: 'weekly',
		},
		{ url: '/docs/Integrations/gtm', priority: 0.7, changeFrequency: 'weekly' },
		{ url: '/privacy', priority: 0.5, changeFrequency: 'yearly' },
		{ url: '/demo', priority: 0.6, changeFrequency: 'monthly' },
		{ url: '/llms.txt', priority: 0.4, changeFrequency: 'weekly' },
	];
}

function processFallbackEntries(
	baseUrl: string,
	lastModified: Date
): MetadataRoute.Sitemap {
	const fallbackEntries = getFallbackEntries();
	return fallbackEntries.map((entry) =>
		createSitemapEntry(
			entry.url,
			baseUrl,
			lastModified,
			entry.priority,
			entry.changeFrequency
		)
	);
}

export async function generateSitemapEntries(): Promise<MetadataRoute.Sitemap> {
	const lastModified = new Date();
	const entries: MetadataRoute.Sitemap = [];

	try {
		const pages = source.getPages();
		const nonDocPages = [
			'/privacy',
			'/demo',
			'/llms.txt',
			'/contributors',
			'/api',
		];

		entries.push(...processSourcePages(pages, SITE_URL, lastModified));
		entries.push(...processNonDocPages(nonDocPages, SITE_URL, lastModified));

		const blogEntries = await processBlogPages(SITE_URL);
		entries.push(...blogEntries);

		// Add the blog index page with lastModified set to latest blog post
		const latestBlogModified = blogEntries.length
			? new Date(
					Math.max(
						...blogEntries
							.map((e) =>
								e.lastModified ? new Date(e.lastModified).getTime() : 0
							)
							.filter((t) => Number.isFinite(t) && t > 0)
					)
				)
			: lastModified;
		entries.push(
			createSitemapEntry(
				'/blog',
				SITE_URL,
				latestBlogModified,
				priorityMap['/blog'],
				changeFrequencyMap['/blog']
			)
		);

		processIntegrationPages(entries);
	} catch (error) {
		console.warn('Failed to generate dynamic sitemap, using fallback:', error);
		entries.push(...processFallbackEntries(SITE_URL, lastModified));
	}

	return entries;
}

export function getSitemapMetadata() {
	return {
		title: 'Databuddy Documentation Sitemap',
		description:
			'Dynamically generated sitemap of Databuddy documentation including all guides, integrations, and API references.',
	};
}
