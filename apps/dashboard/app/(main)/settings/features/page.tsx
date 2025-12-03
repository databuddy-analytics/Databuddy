"use client";

import { RocketIcon } from "@phosphor-icons/react";
import { RightSidebar } from "@/components/right-sidebar";
import { ComingSoon } from "../_components/settings-section";

export default function FeaturesSettingsPage() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<ComingSoon
					description="Get early access to new features, beta UI experiments, and experimental performance optimizations. We're working on bringing these options to you soon."
					icon={
						<RocketIcon
							className="size-8 text-muted-foreground"
							weight="duotone"
						/>
					}
					title="Feature Access Coming Soon"
				/>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Planned Features">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Early access program</p>
						<p>• Beta UI toggle</p>
						<p>• Experimental performance mode</p>
						<p>• Feature previews</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="Soon you'll be able to opt into early access features and help shape the future of Databuddy." />
				</RightSidebar.Section>
			</RightSidebar>
		</div>
	);
}
