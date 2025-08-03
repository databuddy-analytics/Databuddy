import type { MetadataRoute } from 'next';
import { blogSource } from '@/lib/blog-source';
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

function processBlogPages(
	pages: Array<{ url: string }>,
	baseUrl: string,
	lastModified: Date
): MetadataRoute.Sitemap {
	return pages.map((page) =>
		createSitemapEntry(page.url, baseUrl, lastModified, 0.5, 'weekly')
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

export function generateSitemapEntries(): MetadataRoute.Sitemap {
	const baseUrl = 'https://www.databuddy.cc';
	const lastModified = new Date();
	const entries: MetadataRoute.Sitemap = [];

	try {
		const pages = source.getPages();
		const blogPages = blogSource.getPages();
		const nonDocPages = ['/privacy', '/demo', '/llms.txt'];

		entries.push(...processSourcePages(pages, baseUrl, lastModified));
		entries.push(...processBlogPages(blogPages, baseUrl, lastModified));
		entries.push(...processNonDocPages(nonDocPages, baseUrl, lastModified));
		processIntegrationPages(entries);
	} catch (error) {
		console.warn('Failed to generate dynamic sitemap, using fallback:', error);
		entries.push(...processFallbackEntries(baseUrl, lastModified));
	}

	return entries;
}

export function getSitemapMetadata() {
	return {
		title: 'Databuddy Documentation Sitemap',
		description:
			'Dynamically generated sitemap of Databuddy documentation including all guides, integrations, and API references.',
		keywords: [
			'databuddy',
			'analytics',
			'documentation',
			'sitemap',
			'privacy-first',
			'web analytics',
		],
	};
}
