import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import CustomSidebar from '@/components/custom-sidebar';
import { DocsNavbar } from '@/components/docs-navbar';
import { source } from '@/lib/source';

async function getGithubStars(): Promise<number | null> {
	try {
		const response = await fetch(
			'https://api.github.com/repos/databuddy-analytics/databuddy',
			{
				headers: {
					Accept: 'application/vnd.github+json',
				},
				next: { revalidate: 3600 },
			}
		);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as { stargazers_count?: number };
		return typeof data.stargazers_count === 'number'
			? data.stargazers_count
			: null;
	} catch {
		return null;
	}
}

export default async function Layout({ children }: { children: ReactNode }) {
	const stars = await getGithubStars();

	return (
		<DocsLayout
			tree={source.pageTree}
			{...baseOptions}
			nav={{
				enabled: true,
				component: <DocsNavbar stars={stars} />,
			}}
			sidebar={{
				enabled: true,
				component: <CustomSidebar />,
			}}
		>
			{children}
		</DocsLayout>
	);
}
