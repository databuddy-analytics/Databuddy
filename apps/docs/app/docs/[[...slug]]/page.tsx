import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { StructuredData } from '@/components/structured-data';
import { source } from '@/lib/source';
import { getMDXComponents } from '@/mdx-components';

export default async function Page(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) {
		notFound();
	}

	const MDXContent = page.data.body;
	const url = `https://www.databuddy.cc${page.url}`;

	// Generate breadcrumbs from slug
	const breadcrumbs = [
		{ name: 'Home', url: '/' },
		{ name: 'Documentation', url: '/docs' },
	];

	if (params.slug && params.slug.length > 0) {
		let currentPath = '/docs';
		params.slug.forEach((segment, index) => {
			currentPath += `/${segment}`;
			if (index < (params.slug?.length ?? 0) - 1) {
				breadcrumbs.push({
					name: segment.charAt(0).toUpperCase() + segment.slice(1),
					url: currentPath,
				});
			}
		});
	}

	breadcrumbs.push({ name: page.data.title, url: page.url });

	const title = `${page.data.title} | Databuddy Documentation`;
	const description =
		page.data.description ||
		`Learn about ${page.data.title} in Databuddy's privacy-first analytics platform. Complete guides and API documentation.`;

	const publishedDate = new Date();
	const lastModified = page.data.lastModified
		? new Date(page.data.lastModified)
		: null;

	return (
		<>
			<StructuredData
				elements={[
					{
						type: 'article',
						value: {
							title,
							description,
							datePublished: publishedDate.toISOString(),
							dateModified: lastModified?.toISOString(),
						},
					},
				]}
				page={{
					title,
					description,
					url,
					dateModified: lastModified?.toISOString(),
					datePublished: publishedDate.toISOString(),
					breadcrumbs,
					inLanguage: 'en',
				}}
			/>
			<DocsPage full={page.data.full} toc={page.data.toc}>
				<DocsTitle>{page.data.title}</DocsTitle>
				<DocsDescription>{page.data.description}</DocsDescription>
				<DocsBody>
					<MDXContent
						components={getMDXComponents({
							// this allows you to link to other pages with relative file paths
							a: createRelativeLink(source, page),
						})}
					/>
				</DocsBody>
			</DocsPage>
		</>
	);
}

export function generateStaticParams() {
	return source.generateParams();
}

export async function generateMetadata(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = source.getPage(params.slug);
	if (!page) {
		notFound();
	}

	const url = `https://www.databuddy.cc${page.url}`;
	const title = `${page.data.title} | Databuddy Documentation`;
	const description =
		page.data.description ||
		`Learn about ${page.data.title} in Databuddy's privacy-first analytics platform. Complete guides and API documentation.`;

	// Generate dynamic keywords based on page content and URL
	const baseKeywords = [
		page.data.title.toLowerCase(),
		'databuddy',
		'analytics',
		'privacy-first',
		'documentation',
		'web analytics',
		'GDPR compliant',
		'cookieless analytics',
		'data ownership',
	];

	// Add context-specific keywords
	const contextKeywords = [
		...(page.url.includes('integration') || page.url.includes('Integrations')
			? ['integration', 'setup guide', 'installation']
			: []),
		...(page.url.includes('api')
			? ['API', 'reference', 'endpoints', 'REST API']
			: []),
		...(page.url.includes('getting-started')
			? ['tutorial', 'quickstart', 'setup']
			: []),
		...(page.url.includes('sdk') ? ['SDK', 'JavaScript', 'tracking'] : []),
		...(page.url.includes('dashboard') ? ['dashboard', 'interface', 'UI'] : []),
		...(page.url.includes('security')
			? ['security', 'privacy', 'compliance']
			: []),
		...(page.url.includes('performance')
			? ['performance', 'core web vitals', 'optimization']
			: []),
		...(page.url.includes('react') ? ['React', 'React.js', 'component'] : []),
		...(page.url.includes('nextjs')
			? ['Next.js', 'React framework', 'SSR']
			: []),
		...(page.url.includes('wordpress') ? ['WordPress', 'plugin', 'CMS'] : []),
		...(page.url.includes('shopify')
			? ['Shopify', 'e-commerce', 'online store']
			: []),
	];

	return {
		title,
		description,
		keywords: [...baseKeywords, ...contextKeywords],
		authors: [{ name: 'Databuddy Team' }],
		creator: 'Databuddy',
		publisher: 'Databuddy',
		category: 'Documentation',
		openGraph: {
			title,
			description,
			url,
			siteName: 'Databuddy Documentation',
			type: 'article',
			locale: 'en_US',
			images: [
				{
					url: 'https://www.databuddy.cc/og.webp',
					width: 1200,
					height: 630,
					alt: `${page.data.title} - Databuddy Documentation`,
				},
			],
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
			images: ['https://www.databuddy.cc/og.webp'],
			creator: '@databuddyps',
			site: '@databuddyps',
		},
		alternates: {
			canonical: url,
		},
		robots: {
			index: true,
			follow: true,
			'max-image-preview': 'large',
			'max-snippet': -1,
			'max-video-preview': -1,
			googleBot: {
				index: true,
				follow: true,
				'max-video-preview': -1,
				'max-image-preview': 'large',
				'max-snippet': -1,
			},
		},
		other: {
			'article:section': 'Documentation',
			'article:tag': page.data.title,
			'article:author': 'Databuddy Team',
			'og:site_name': 'Databuddy Documentation',
		},
	};
}
