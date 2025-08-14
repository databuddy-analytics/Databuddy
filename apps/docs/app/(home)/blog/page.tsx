import {
	CalendarIcon,
	ClockIcon,
	TagIcon,
	UserIcon,
} from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Footer } from '@/components/footer';
import { SciFiButton } from '@/components/landing/scifi-btn';
import Section from '@/components/landing/section';
import { Spotlight } from '@/components/landing/spotlight';
import { getPosts } from '@/lib/blog-query';
import type { Post } from '@/types/post';

export const revalidate = 3600;

// Move regex to top level for performance
const WORD_SPLIT_REGEX = /\s+/;

export const metadata: Metadata = {
	title: 'Blog | Databuddy',
	description:
		'Insights, updates, and guides on privacy-first analytics, GDPR compliance, and modern web development.',
};

function BlogPostCard({ post }: { post: Post }) {
	const formatDate = (date: Date) => {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	const getReadingTime = (content: string) => {
		const wordsPerMinute = 200;
		const wordCount = content.split(WORD_SPLIT_REGEX).length;
		const readingTime = Math.ceil(wordCount / wordsPerMinute);
		return `${readingTime} min read`;
	};

	return (
		<Link
			aria-label={`Read ${post.title}`}
			className="block h-full"
			href={`/blog/${post.slug}`}
		>
			<div className="group relative flex h-full flex-col rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 hover:shadow-lg">
				{/* Cover Image */}
				{post.coverImage && (
					<div className="relative overflow-hidden rounded-t">
						<Image
							alt={post.title}
							className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-105"
							height={240}
							src={post.coverImage}
							width={400}
						/>
						<div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent" />
					</div>
				)}

				{/* Content */}
				<div className="flex flex-1 flex-col p-6">
					{/* Category & Reading Time */}
					<div className="mb-3 flex items-center gap-3 text-muted-foreground text-xs">
						{post.category && (
							<div className="flex items-center gap-1">
								<TagIcon className="h-3 w-3" weight="duotone" />
								<span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
									{post.category.name}
								</span>
							</div>
						)}
						<div className="flex items-center gap-1">
							<ClockIcon className="h-3 w-3" weight="duotone" />
							<span>{getReadingTime(post.content)}</span>
						</div>
					</div>

					{/* Title */}
					<h2 className="mb-3 line-clamp-2 font-bold text-foreground text-xl leading-tight transition-colors group-hover:text-primary">
						{post.title}
					</h2>

					{/* Description */}
					<p className="mb-4 line-clamp-2 text-muted-foreground text-sm leading-relaxed">
						{post.description}
					</p>

					{/* Tags */}
					{post.tags && post.tags.length > 0 && (
						<div className="mb-4 flex flex-wrap gap-1">
							{post.tags.slice(0, 3).map((tag) => (
								<span
									className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs"
									key={tag.id}
								>
									{tag.name}
								</span>
							))}
							{post.tags.length > 3 && (
								<span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">
									+{post.tags.length - 3} more
								</span>
							)}
						</div>
					)}

					{/* Footer */}
					<div className="mt-auto flex items-center justify-between border-border/30 border-t pt-4">
						{/* Authors */}
						<div className="flex items-center gap-2">
							<UserIcon
								className="h-4 w-4 text-muted-foreground"
								weight="duotone"
							/>
							<div className="-space-x-2 flex">
								{post.authors.slice(0, 2).map((author) => (
									<Image
										alt={author.name}
										className="h-6 w-6 rounded-full border-2 border-background"
										height={24}
										key={author.id}
										src={author.image}
										width={24}
									/>
								))}
							</div>
							<span className="text-muted-foreground text-xs">
								{post.authors.length === 1
									? post.authors[0].name
									: `${post.authors[0].name} ${post.authors.length > 1 ? `+${post.authors.length - 1}` : ''}`}
							</span>
						</div>

						{/* Date */}
						<div className="flex items-center gap-1 text-muted-foreground text-xs">
							<CalendarIcon className="h-3 w-3" weight="duotone" />
							<span>{formatDate(post.publishedAt)}</span>
						</div>
					</div>
				</div>

				{/* Sci-fi corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>
			</div>
		</Link>
	);
}

export default async function BlogPage() {
	const result = await getPosts();
	const posts = 'error' in result ? [] : result.posts;
	const sortedPosts = [...posts].sort(
		(a, b) =>
			new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
	);

	return (
		<div className="overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			{/* Hero Section */}
			<Section className="overflow-hidden" customPaddings id="blog-hero">
				<section className="relative w-full pt-16 pb-10 sm:pt-20 sm:pb-12 lg:pt-24 lg:pb-14">
					<div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
						{/* Header */}
						<div className="mb-8 text-center lg:mb-10">
							<div className="mx-auto mb-3 inline-flex items-center gap-2 rounded border border-border bg-card/50 px-2.5 py-1 font-medium text-[11px] text-muted-foreground tracking-wide">
								<span
									aria-hidden="true"
									className="h-1.5 w-1.5 rounded bg-foreground/60"
								/>
								DATABUDDY
								<span className="text-foreground/40">•</span>
								BLOG
							</div>
							<h1 className="mb-2 font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-5xl">
								Privacy‑first analytics
								<span className="text-muted-foreground"> guides</span>
							</h1>
							<p className="mx-auto max-w-2xl text-balance font-medium text-muted-foreground text-xs leading-relaxed tracking-tight sm:text-sm lg:text-base">
								Practical articles on instrumentation, compliance, and
								developer‑first analytics from the Databuddy team.
							</p>
						</div>
					</div>
				</section>
			</Section>

			{/* Blog Posts Grid */}
			<Section
				className="border-border border-t bg-background/50"
				id="blog-posts"
			>
				<div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
					{sortedPosts.length > 0 ? (
						<div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
							{sortedPosts.map((post) => (
								<BlogPostCard key={post.id} post={post} />
							))}
						</div>
					) : (
						<div className="mx-auto max-w-lg">
							<div className="group relative">
								<div className="relative rounded border border-border bg-card/50 p-8 text-center backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-12">
									<TagIcon
										className="mx-auto mb-4 h-12 w-12 text-muted-foreground transition-colors duration-300 group-hover:text-foreground sm:h-16 sm:w-16"
										weight="duotone"
									/>
									<h1 className="mb-3 text-balance font-semibold text-2xl leading-tight tracking-tight sm:text-3xl md:text-4xl">
										No Posts Yet
									</h1>
									<p className="mb-6 font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base">
										We're working on some amazing content. Check back soon for
										insights on privacy-first analytics and modern web
										development.
									</p>
									<div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
										<SciFiButton asChild className="flex-1 sm:flex-initial">
											<Link aria-label="Back to home" href="/">
												Back to Home
											</Link>
										</SciFiButton>
									</div>
								</div>

								{/* Sci-fi corners */}
								<div className="pointer-events-none absolute inset-0">
									<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
										<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
										<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
									</div>
									<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
										<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
										<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
									</div>
									<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
										<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
										<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
									</div>
									<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
										<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
										<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</Section>

			{/* Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>

			{/* Footer Section */}
			<Footer />

			{/* Final Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>
		</div>
	);
}
