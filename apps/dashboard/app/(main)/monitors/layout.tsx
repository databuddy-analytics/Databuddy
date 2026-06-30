"use client";

import { usePathname } from "next/navigation";
import { PageNavigation } from "@/components/layout/page-navigation";
import { GlobeSimpleIcon, HeartbeatIcon } from "@databuddy/ui/icons";

const MONITORING_LIST_ROUTES = new Set(["/monitors", "/monitors/status-pages"]);

export default function MonitoringLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const pathname = usePathname();

	if (!MONITORING_LIST_ROUTES.has(pathname)) {
		return children;
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageNavigation
				tabs={[
					{
						id: "monitors",
						label: "Monitors",
						href: "/monitors",
						icon: HeartbeatIcon,
					},
					{
						id: "status-pages",
						label: "Status Pages",
						href: "/monitors/status-pages",
						icon: GlobeSimpleIcon,
					},
				]}
				variant="tabs"
			/>
			<div className="min-h-0 flex-1 overflow-hidden">{children}</div>
		</div>
	);
}
