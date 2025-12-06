"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
import { RightSidebar } from "@/components/right-sidebar";
import { SettingsSection } from "../_components/settings-section";

export default function AnalyticsSettingsPage() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<SettingsSection
					description="Configure analytics display preferences"
					title="Analytics Settings"
				>
					<div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
						<ChartLineIcon
							className="size-12 text-muted-foreground"
							weight="duotone"
						/>
						<p className="text-muted-foreground text-sm">
							Analytics settings coming soon
						</p>
					</div>
				</SettingsSection>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section>
					<RightSidebar.Tip description="Analytics settings will allow you to customize how metrics are calculated and displayed." />
				</RightSidebar.Section>
			</RightSidebar>
		</div>
	);
}
