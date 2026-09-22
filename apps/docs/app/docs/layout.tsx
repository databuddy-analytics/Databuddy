import { baseOptions } from "@/app/layout.config";
import CustomSidebar from "@/components/custom-sidebar";
import { Navbar } from "@/components/navbar";
import { source } from "@/lib/source";
import { getGithubStars } from "@/lib/utils";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

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
				component: <Navbar stars={stars} variant="solid" />,
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
