"use client";

import { PlugIcon } from "@phosphor-icons/react";
import { RightSidebar } from "@/components/right-sidebar";
import { ComingSoon } from "../_components/settings-section";

export default function IntegrationsSettingsPage() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<ComingSoon
					description="Connect Stripe, GitHub, Google, Slack, Discord and more. We're working hard to bring you these integrations soon."
					icon={
						<PlugIcon
							className="size-8 text-muted-foreground"
							weight="duotone"
						/>
					}
					title="Integrations Coming Soon"
				/>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Planned Integrations">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Stripe for payment analytics</p>
						<p>• GitHub for deployment tracking</p>
						<p>• Slack & Discord alerts</p>
						<p>• Google Analytics import</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Integrations will allow you to connect your favorite tools and automate your workflow." />
				</RightSidebar.Section>
			</RightSidebar>
		</div>
	);
}
