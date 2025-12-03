"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
import { RightSidebar } from "@/components/right-sidebar";
import { ComingSoon } from "../_components/settings-section";

export default function AnalyticsSettingsPage() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<ComingSoon
					description="Configure default date ranges, timezones, auto-refresh behavior, and bot filtering. We're working on making these settings available soon."
					icon={
						<ChartLineIcon
							className="size-8 text-muted-foreground"
							weight="duotone"
						/>
					}
					title="Analytics Settings Coming Soon"
				/>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Planned Settings">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Default date range</p>
						<p>• Timezone preferences</p>
						<p>• Auto-refresh behavior</p>
						<p>• Bot filtering options</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="These settings will let you customize how analytics are displayed across all your websites." />
				</RightSidebar.Section>
			</RightSidebar>
		</div>
	);
}
