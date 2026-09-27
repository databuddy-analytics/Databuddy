import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";
import { baseOptions } from "@/app/layout.config";
import { Navbar } from "@/components/navbar";
import { getGithubStars } from "@/lib/utils";

export default async function Layout({ children }: { children: ReactNode }) {
	const stars = await getGithubStars();

	return (
		<HomeLayout {...baseOptions}>
			<Navbar stars={stars} />
			<div className="flex min-h-0 flex-1 flex-col">{children}</div>
		</HomeLayout>
	);
}
