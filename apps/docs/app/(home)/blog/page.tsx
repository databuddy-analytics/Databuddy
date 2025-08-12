import type { Metadata } from 'next';
import Link from 'next/link';
import { getPosts } from '@/lib/blog-query';

export const revalidate = 3600;

export const metadata: Metadata = {
	title: 'Blog | Databuddy',
	description:
		'Insights, updates, and guides on privacy-first analytics, GDPR compliance, and modern web development.',
};

export default async function BlogPage() {
	const { posts } = await getPosts();

	return (
		<div>
			<h1>Databuddy Blog</h1>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{posts.map((post) => (
					<Link href={`/blog/${post.slug}`} key={post.id}>
						<div>
							<h2>{post.title}</h2>
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}
