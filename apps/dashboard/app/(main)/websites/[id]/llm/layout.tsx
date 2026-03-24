"use client";

import {
	BrainIcon,
	ChartLineIcon,
	CurrencyDollarIcon,
	TableIcon,
	WarningIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useParams, usePathname } from "next/navigation";
import { PageNavigation } from "@/components/layout/page-navigation";

export default function LlmAnalyticsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams();
	const pathname = usePathname();
	const websiteId = params.id as string;
	const isDemo = pathname?.startsWith("/demo/");
	const basePath = isDemo
		? `/demo/${websiteId}/llm`
		: `/websites/${websiteId}/llm`;

	return (
		<div className="flex h-full flex-col">
			<PageNavigation
				tabs={[
					{
						id: "overview",
						label: "Overview",
						href: basePath,
						icon: BrainIcon,
					},
					{
						id: "performance",
						label: "Performance",
						href: `${basePath}/performance`,
						icon: ChartLineIcon,
					},
					{
						id: "cost",
						label: "Cost",
						href: `${basePath}/cost`,
						icon: CurrencyDollarIcon,
					},
					{
						id: "errors",
						label: "Errors",
						href: `${basePath}/errors`,
						icon: WarningIcon,
					},
					{
						id: "traces",
						label: "Traces",
						href: `${basePath}/traces`,
						icon: TableIcon,
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
