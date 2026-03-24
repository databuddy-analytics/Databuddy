"use client";

import { BrainIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import { PageNavigation } from "@/components/layout/page-navigation";
import { LLMPageProvider } from "./_components/llm-page-context";
import { LLMPageHeader } from "./_components/llm-page-header";

export default function LlmAnalyticsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const basePath = "/llm";

	return (
		<LLMPageProvider>
			<div className="flex h-full flex-col">
				<LLMPageHeader />
				<PageNavigation
					tabs={[
						{
							id: "overview",
							label: "Overview",
							href: basePath,
							icon: BrainIcon,
						},
						{
							id: "errors",
							label: "Errors",
							href: `${basePath}/errors`,
							icon: WarningIcon,
						},
					]}
					variant="tabs"
				/>
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					{children}
				</div>
			</div>
		</LLMPageProvider>
	);
}
