"use client";

import { ShieldCheckIcon } from "@phosphor-icons/react";
import { RightSidebar } from "@/components/right-sidebar";
import { ComingSoon } from "../_components/settings-section";

export default function PrivacySettingsPage() {
	return (
		<div className="h-full lg:grid lg:grid-cols-[1fr_18rem]">
			<div className="flex flex-col">
				<ComingSoon
					description="Manage data retention, export your data, control tracking consent, and delete your account. We're working on making these privacy controls available soon."
					icon={
						<ShieldCheckIcon
							className="size-8 text-muted-foreground"
							weight="duotone"
						/>
					}
					title="Privacy Settings Coming Soon"
				/>
			</div>

			<RightSidebar className="gap-0 p-0">
				<RightSidebar.Section border title="Planned Controls">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>• Data retention settings</p>
						<p>• Export your data</p>
						<p>• Tracking consent</p>
						<p>• Account deletion</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section border title="Data Protection">
					<div className="space-y-2 text-muted-foreground text-sm">
						<p>Your data is encrypted at rest and in transit using AES-256.</p>
						<p>We comply with GDPR and CCPA regulations.</p>
					</div>
				</RightSidebar.Section>

				<RightSidebar.Section>
					<RightSidebar.Tip description="We take your privacy seriously. You'll be able to export or delete your data at any time." />
				</RightSidebar.Section>
			</RightSidebar>
		</div>
	);
}
