"use client";

import { BellIcon } from "@phosphor-icons/react";
import { RightSidebar } from "@/components/right-sidebar";
import { ComingSoon } from "../_components/settings-section";

export default function NotificationsSettingsPage() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<ComingSoon
					description="Configure email alerts, push notifications, and weekly reports. Stay informed about your analytics and account activity."
					icon={
						<BellIcon
							className="size-8 text-muted-foreground"
							weight="duotone"
						/>
					}
					title="Notifications Coming Soon"
				/>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Planned Alerts">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Traffic spike alerts</p>
						<p>• Goal completion notifications</p>
						<p>• Error rate warnings</p>
						<p>• Weekly digest emails</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Soon you'll be able to receive alerts when traffic spikes, goals are met, or errors occur." />
				</RightSidebar.Section>
			</RightSidebar>
		</div>
	);
}
