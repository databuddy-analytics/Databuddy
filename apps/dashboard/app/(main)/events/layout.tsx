"use client";

import { ChartBarIcon } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { ListBulletsIcon } from "@phosphor-icons/react/dist/ssr/ListBullets";
import { PageNavigation } from "@/components/layout/page-navigation";
import { EventsPageProvider } from "./_components/events-page-context";
import { EventsPageHeader } from "./_components/events-page-header";

export default function EventsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const basePath = "/events";

	return (
		<EventsPageProvider>
			<div className="flex h-full flex-col">
				<EventsPageHeader />
				<PageNavigation
					tabs={[
						{
							id: "summary",
							label: "Summary",
							href: basePath,
							icon: ChartBarIcon,
						},
						{
							id: "stream",
							label: "Stream",
							href: `${basePath}/stream`,
							icon: ListBulletsIcon,
						},
					]}
					variant="tabs"
				/>
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					{children}
				</div>
			</div>
		</EventsPageProvider>
	);
}
