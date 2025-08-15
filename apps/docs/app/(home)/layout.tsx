import { HomeLayout } from 'fumadocs-ui/layouts/home';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { Navbar } from '@/components/navbar';

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
		<HomeLayout {...baseOptions}>
			<Navbar stars={stars} />
			<main className="flex min-h-screen flex-col font-manrope">
				{children}
			</main>
		</HomeLayout>
	);
}
