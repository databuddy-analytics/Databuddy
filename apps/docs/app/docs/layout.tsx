import { baseOptions } from "@/app/layout.config";
import CustomSidebar from "@/components/custom-sidebar";
import { Navbar } from "@/components/navbar";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

async function getGithubStars(): Promise<number | null> {
	try {
		const response = await fetch(
			"https://api.github.com/repos/databuddy-analytics/databuddy",
			{
				headers: {
					Accept: "application/vnd.github+json",
				},
				next: { revalidate: 3600 },
			}
		);

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as { stargazers_count?: number };
		return typeof data.stargazers_count === "number"
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
			containerProps={{
				className: "min-h-0 flex-1",
			}}
			nav={{
				enabled: true,
				component: <Navbar stars={stars} />,
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
