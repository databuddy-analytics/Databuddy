"use client";

import { ChartBarIcon } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { ListBulletsIcon } from "@phosphor-icons/react/dist/ssr/ListBullets";
import { useParams } from "next/navigation";
import { PageNavigation } from "@/components/layout/page-navigation";

export default function EventsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams();
	const websiteId = params.id as string;
	const eventName = params.eventName as string | undefined;

	const isDetailPage = Boolean(eventName);

	if (isDetailPage && eventName) {
		const decodedEventName = decodeURIComponent(eventName);
		return (
			<div className="flex h-full min-h-0 flex-col">
				<PageNavigation
					breadcrumb={{
						label: "Events",
						href: `/websites/${websiteId}/events`,
					}}
					currentPage={decodedEventName}
					variant="breadcrumb"
				/>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
				{children}
			</div>
		</div>
	);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageNavigation
				tabs={[
					{
						id: "summary",
						label: "Summary",
						href: `/websites/${websiteId}/events`,
						icon: ChartBarIcon,
					},
					{
						id: "stream",
						label: "Stream",
						href: `/websites/${websiteId}/events/stream`,
						icon: ListBulletsIcon,
					},
				]}
				variant="tabs"
			/>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
				{children}
			</div>
		</div>
	);
}
