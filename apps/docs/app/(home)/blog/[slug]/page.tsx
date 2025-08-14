import { formatDate } from '@databuddy/shared';
import {
	ArrowLeftIcon,
	CalendarIcon,
	ClockIcon,
	UserIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { SITE_URL } from '@/app/util/constants';
import { Footer } from '@/components/footer';
import { SciFiButton } from '@/components/landing/scifi-btn';
import { Prose } from '@/components/prose';
import { getPosts, getSinglePost } from '@/lib/blog-query';
import type { Post } from '@/types/post';

const STRIP_HTML_REGEX = /<[^>]+>/g;
const WORD_SPLIT_REGEX = /\s+/;

export const revalidate = 300;

export async function generateStaticParams() {
	try {
		const result = await getPosts();
		if ('error' in result) {
			return [];
		}
		return result.posts.map((post) => ({
			slug: post.slug,
		}));
	} catch {
		return [];
	}
}

interface PageProps {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const slug = (await params).slug;

	try {
		const data = await getSinglePost(slug);
		if ('error' in data || !data?.post) {
			return { title: 'Not Found | Databuddy' };
		}

		return {
			title: `${data.post.title} | Databuddy`,
			description: data.post.description,
			twitter: {
				title: `${data.post.title} | Databuddy`,
				description: data.post.description,
				card: 'summary_large_image',
				images: [
					{
						url: data.post.coverImage ?? `${SITE_URL}/og.webp`,
						width: '1200',
						height: '630',
						alt: data.post.title,
					},
				],
			},
			openGraph: {
				title: `${data.post.title} | Databuddy`,
				description: data.post.description,
				type: 'article',
				images: [
					{
						url: data.post.coverImage ?? `${SITE_URL}/og.webp`,
						width: '1200',
						height: '630',
						alt: data.post.title,
					},
				],
				publishedTime: new Date(data.post.publishedAt).toISOString(),
				authors: [
					...data.post.authors.map((author: { name: string }) => author.name),
				],
			},
		};
	} catch {
		return { title: 'Not Found | Databuddy' };
	}
}

export default async function PostPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const result = (await getSinglePost(slug)) as {
		post?: Post;
		error?: boolean;
		status?: number;
		statusText?: string;
	};
	if (!result?.post) {
		return (
			<>
				<div className="relative flex min-h-[60vh] w-full items-center justify-center overflow-hidden px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8">
					{/* Main Content */}
					<div className="relative z-10 mx-auto w-full max-w-lg text-center">
						<div className="group relative">
							<div className="relative rounded border border-border bg-card/50 p-8 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-12">
								<WarningCircleIcon
									className="mx-auto mb-4 h-12 w-12 text-muted-foreground transition-colors duration-300 group-hover:text-foreground sm:h-16 sm:w-16"
									weight="duotone"
								/>
								<h1 className="mb-3 text-balance font-semibold text-2xl leading-tight tracking-tight sm:text-3xl md:text-4xl">
									Post Not Found
								</h1>
								<p className="mb-6 font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base">
									The article you're looking for seems to have been moved or no
									longer exists.
								</p>
								<div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
									<SciFiButton asChild className="flex-1 sm:flex-initial">
										<Link aria-label="Back to blog" href="/blog">
											<ArrowLeftIcon className="h-4 w-4" weight="fill" />
											Back to Blog
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
				</div>
				<Footer />
			</>
		);
	}

	const post = result.post;

	const estimateReadingTime = (htmlContent: string): string => {
		const text = htmlContent.replace(STRIP_HTML_REGEX, ' ');
		const words = text.trim().split(WORD_SPLIT_REGEX).filter(Boolean).length;
		const minutes = Math.max(1, Math.ceil(words / 200));
		return `${minutes} min read`;
	};

	const readingTime = estimateReadingTime(post.content);

	return (
		<>
			<div className="mx-auto w-full max-w-3xl px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8">
				<div className="mb-4">
					<Link
						aria-label="Back to blog"
						className="inline-flex items-center gap-2 text-muted-foreground text-xs hover:text-foreground"
						href="/blog"
					>
						<ArrowLeftIcon className="h-3.5 w-3.5" weight="fill" />
						Back to blog
					</Link>
				</div>
				{/* Title */}
				<h1 className="mb-3 text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl">
					{post.title}
				</h1>

				{/* Metadata */}
				<div className="mb-4 flex flex-wrap items-center gap-4 text-muted-foreground text-xs sm:text-sm">
					<div className="flex items-center gap-2">
						<UserIcon className="h-4 w-4" weight="duotone" />
						<div className="-space-x-2 flex">
							{post.authors.slice(0, 3).map((author) => (
								<Image
									alt={author.name}
									className="h-6 w-6 rounded border-2 border-background"
									height={24}
									key={author.id}
									src={author.image}
									width={24}
								/>
							))}
						</div>
						<span>
							{post.authors.length === 1
								? post.authors[0].name
								: `${post.authors[0].name} +${post.authors.length - 1}`}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<CalendarIcon className="h-4 w-4" weight="duotone" />
						<span>{formatDate(post.publishedAt)}</span>
					</div>
					<div className="flex items-center gap-2">
						<ClockIcon className="h-4 w-4" weight="duotone" />
						<span>{readingTime}</span>
					</div>
				</div>

				{/* TL;DR */}
				{post.description && (
					<div className="mb-6 rounded border border-border bg-card/50 p-4">
						<div className="mb-1 font-semibold text-foreground/70 text-xs tracking-wide">
							TL;DR
						</div>
						<p className="text-muted-foreground text-sm">{post.description}</p>
					</div>
				)}

				{/* Cover Image */}
				{post.coverImage && (
					<div className="mb-6 overflow-hidden rounded">
						<Image
							alt={post.title}
							className="aspect-video w-full object-cover"
							height={630}
							src={post.coverImage}
							width={1200}
						/>
					</div>
				)}

				{/* Content */}
				<Prose html={post.content} />
			</div>
			<div className="mt-8" />
			<Footer />
		</>
	);
}
