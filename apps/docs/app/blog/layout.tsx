import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { blogSource } from '@/lib/blog-source';

export default function BlogLayout({ children }: { children: ReactNode }) {
	return (
		<DocsLayout tree={blogSource.pageTree} {...baseOptions}>
			{children}
		</DocsLayout>
	);
}
