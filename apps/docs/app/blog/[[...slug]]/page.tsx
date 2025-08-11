import { formatDistanceToNow } from 'date-fns';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { StructuredData } from '@/components/structured-data';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { blogSource } from '@/lib/blog-source';
import { getMDXComponents } from '@/mdx-components';

export default async function BlogPage(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = blogSource.getPage(params.slug);
	if (!page) {
		notFound();
	}

	const MDXContent = page.data.body;
	const publishedDate = new Date(page.data.publishedAt);
	const lastModified = page.data.lastModified
		? new Date(page.data.lastModified)
		: null;

	// Calculate reading time (rough estimate)
	const wordsPerMinute = 200;
	const wordCount = page.data.description?.split(' ').length || 0;
	const readingTime = Math.ceil(wordCount / wordsPerMinute) || 1;

	// Safely extract string values with fallbacks
	const title = String(page.data.title || 'Databuddy Blog');
	const description = String(
		page.data.description || 'Privacy-first analytics insights'
	);
	const author = String(page.data.author || 'izadoesdev');
	const category = String(page.data.category || 'General');
	const url = `https://www.databuddy.cc/blog/${params.slug?.join('/') || ''}`;

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
					inLanguage: 'en',
				}}
			/>
			<DocsPage full={page.data.full} toc={page.data.toc}>
				{/* Enhanced header with better visual hierarchy */}
				<div className="mb-12">
					<DocsTitle className="mb-6 font-bold text-4xl leading-tight sm:text-5xl">
						{title}
					</DocsTitle>
					<DocsDescription className="mb-8 text-muted-foreground text-xl leading-relaxed">
						{description}
					</DocsDescription>

					{/* Enhanced metadata section with better styling */}
					<div className="rounded-xl border bg-gradient-to-r from-muted/50 to-muted/30 p-6">
						<div className="flex flex-wrap items-center gap-6 text-sm">
							{/* Author info with avatar placeholder */}
							<div className="flex items-center gap-3">
								<Avatar className="flex items-center gap-3">
									<AvatarImage src="/blog-photo.png" />
									<AvatarFallback>IZ</AvatarFallback>
								</Avatar>
								<div>
									<div className="font-semibold text-foreground">{author}</div>
									<div className="text-muted-foreground text-xs">Author</div>
								</div>
							</div>

							{/* Publication date */}
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-green-500" />
								<div>
									<div className="font-medium text-foreground">
										{publishedDate.toLocaleDateString('en-US', {
											year: 'numeric',
											month: 'long',
											day: 'numeric',
										})}
									</div>
									<div className="text-muted-foreground text-xs">
										{formatDistanceToNow(publishedDate, { addSuffix: true })}
									</div>
								</div>
							</div>

							{/* Reading time */}
							<div className="flex items-center gap-2">
								<svg
									aria-hidden="true"
									className="h-4 w-4 text-muted-foreground"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
									/>
								</svg>
								<div>
									<div className="font-medium text-foreground">
										{readingTime} min read
									</div>
									<div className="text-muted-foreground text-xs">
										Reading time
									</div>
								</div>
							</div>

							{/* Last modified */}
							{lastModified && (
								<div className="flex items-center gap-2">
									<svg
										aria-hidden="true"
										className="h-4 w-4 text-muted-foreground"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
										/>
									</svg>
									<div>
										<div className="font-medium text-foreground">
											{lastModified.toLocaleDateString('en-US', {
												year: 'numeric',
												month: 'short',
												day: 'numeric',
											})}
										</div>
										<div className="text-muted-foreground text-xs">
											Last updated
										</div>
									</div>
								</div>
							)}
						</div>

						{/* Category and tags section */}
						<div className="mt-6 flex flex-wrap items-center gap-4 border-border/50 border-t pt-6">
							{/* Category badge */}
							<div className="flex items-center gap-2">
								<span className="font-medium text-muted-foreground text-xs">
									Category:
								</span>
								<span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 font-semibold text-primary text-sm">
									{category}
								</span>
								{page.data.featured && (
									<span className="rounded-full border border-yellow-200 bg-yellow-100 px-3 py-1.5 font-semibold text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
										⭐ Featured
									</span>
								)}
							</div>

							{/* Tags */}
							{page.data.tags && page.data.tags.length > 0 && (
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium text-muted-foreground text-xs">
										Tags:
									</span>
									{page.data.tags.map((tag: string) => (
										<span
											className="cursor-pointer rounded-md border border-border/50 bg-muted px-2.5 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted/80 hover:text-foreground"
											key={tag}
										>
											#{tag}
										</span>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Main content with improved styling */}
				<DocsBody className="prose prose-lg dark:prose-invert max-w-none">
					<MDXContent
						components={getMDXComponents({
							a: createRelativeLink(blogSource, page),
						})}
					/>
				</DocsBody>

				{/* Enhanced footer section */}
				<div className="mt-16 space-y-8">
					{/* Engagement section */}
					<div className="rounded-xl border border-blue-200/50 bg-gradient-to-r from-blue-50 to-indigo-50 p-8 dark:border-blue-800/50 dark:from-blue-950/50 dark:to-indigo-950/50">
						<div className="text-center">
							<h3 className="mb-4 font-bold text-2xl text-blue-900 dark:text-blue-100">
								Found this helpful?
							</h3>
							<p className="mx-auto mb-6 max-w-2xl text-blue-800 dark:text-blue-200">
								Share this article with others who might benefit from
								privacy-first analytics insights.
							</p>

							{/* Enhanced sharing buttons */}
							<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
								<a
									className="inline-flex transform items-center gap-2 rounded-lg bg-blue-500 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:scale-105 hover:bg-blue-600 hover:shadow-xl"
									href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}&via=databuddyps`}
									rel="noopener noreferrer"
									target="_blank"
								>
									<svg
										aria-hidden="true"
										className="h-5 w-5"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
									</svg>
									Share on Twitter
								</a>

								<a
									className="inline-flex transform items-center gap-2 rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white shadow-lg transition-all hover:scale-105 hover:bg-blue-800 hover:shadow-xl"
									href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
									rel="noopener noreferrer"
									target="_blank"
								>
									<svg
										aria-hidden="true"
										className="h-5 w-5"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
									</svg>
									Share on LinkedIn
								</a>
							</div>
						</div>
					</div>

					{/* Call to action */}
					<div className="rounded-xl border border-green-200/50 bg-gradient-to-r from-green-50 to-emerald-50 p-8 text-center dark:border-green-800/50 dark:from-green-950/50 dark:to-emerald-950/50">
						<h3 className="mb-4 font-bold text-2xl text-green-900 dark:text-green-100">
							Ready to try privacy-first analytics?
						</h3>
						<p className="mx-auto mb-6 max-w-2xl text-green-800 dark:text-green-200">
							Get started with Databuddy today. No consent banners, no cookies,
							just powerful insights that respect your users' privacy.
						</p>
						<div className="flex flex-col justify-center gap-4 sm:flex-row">
							<a
								className="inline-flex transform items-center justify-center rounded-xl bg-green-600 px-8 py-4 font-semibold text-lg text-white shadow-lg transition-all hover:scale-105 hover:bg-green-700 hover:shadow-xl"
								href="https://app.databuddy.cc/register"
							>
								🚀 Start Free Trial
							</a>
						</div>
					</div>
				</div>
			</DocsPage>
		</>
	);
}

export function generateStaticParams() {
	return blogSource.generateParams();
}

export async function generateMetadata(props: {
	params: Promise<{ slug?: string[] }>;
}) {
	const params = await props.params;
	const page = blogSource.getPage(params.slug);
	if (!page) {
		notFound();
	}

	const title = `${String(page.data.title || 'Databuddy Blog')} | Databuddy Blog`;
	const description = String(
		page.data.description ||
			'Privacy-first analytics insights and industry expertise from the Databuddy team.'
	);
	const author = String(page.data.author || 'izadoesdev');
	const url = `https://www.databuddy.cc/blog/${params.slug?.join('/') || ''}`;
	const category = String(page.data.category || 'Analytics');

	return {
		title,
		description,
		keywords: [
			...(page.data.tags || []),
			'databuddy',
			'analytics',
			'privacy-first',
			'web analytics',
			'GDPR compliant',
			category.toLowerCase(),
			'blog',
			'insights',
		],
		authors: [{ name: author }],
		creator: 'Databuddy',
		publisher: 'Databuddy',
		category,
		openGraph: {
			title,
			description,
			type: 'article',
			url,
			siteName: 'Databuddy Blog',
			locale: 'en_US',
			publishedTime: page.data.publishedAt,
			modifiedTime: page.data.lastModified || page.data.publishedAt,
			authors: [author],
			section: category,
			tags: page.data.tags,
			images: [
				{
					url: '/og-blog.webp',
					width: 1200,
					height: 630,
					alt: `${page.data.title} - Databuddy Blog`,
				},
			],
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
			images: ['/og-blog.webp'],
			site: '@databuddyps',
			creator: '@databuddyps',
		},
		alternates: {
			canonical: url,
		},
		robots: {
			index: true,
			follow: true,
			googleBot: {
				index: true,
				follow: true,
				'max-video-preview': -1,
				'max-image-preview': 'large',
				'max-snippet': -1,
			},
		},
		other: {
			'article:author': author,
			'article:section': category,
			'article:published_time': page.data.publishedAt,
			'article:modified_time': page.data.lastModified || page.data.publishedAt,
			'article:tag': page.data.tags?.join(', ') || '',
		},
	};
}
