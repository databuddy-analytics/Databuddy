import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/app/util/constants';
import { Prose } from '@/components/prose';
import { getPosts, getSinglePost } from '@/lib/blog-query';

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

	return (
		<div className="mx-auto max-w-3xl">
			{post.coverImage && (
				<Image
					alt={post.title}
					height={630}
					src={post.coverImage}
					width={1200}
				/>
			)}
			<h1 className="font-bold text-3xl">{post.title}</h1>
			<Prose html={post.content} />
		</div>
	);
}
