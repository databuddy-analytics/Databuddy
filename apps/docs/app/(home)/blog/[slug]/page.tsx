import { formatDate } from '@databuddy/shared';
import {
	ArrowLeftIcon,
	CalendarIcon,
	ClockIcon,
	UserIcon,
} from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/app/util/constants';
import { Footer } from '@/components/footer';
import { Prose } from '@/components/prose';
import { getPosts, getSinglePost } from '@/lib/blog-query';

const STRIP_HTML_REGEX = /<[^>]+>/g;
const WORD_SPLIT_REGEX = /\s+/;

export const revalidate = 300;

export async function generateStaticParams() {
	const { posts } = await getPosts();
	return posts.map((post) => ({
		slug: post.slug,
	}));
}

interface PageProps {
	params: Promise<{ slug: string }>;
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const slug = (await params).slug;

	const data = await getSinglePost(slug);

	if (!data?.post) {
		return notFound();
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
}

export default async function PostPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const slug = (await params).slug;

	const { post } = await getSinglePost(slug);

	if (!post) {
		return notFound();
	}

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
