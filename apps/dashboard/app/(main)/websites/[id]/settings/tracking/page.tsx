"use client";

import { CodeIcon } from "@phosphor-icons/react";
import { useParams } from "next/navigation";
import { PageHeader } from "../../../_components/page-header";
import { WebsiteTrackingSetupTab } from "../../_components/tabs/tracking-setup-tab";

export default function TrackingSetupPage() {
	const params = useParams();
	const websiteId = params.id as string;

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				description="Installation code, setup instructions, and troubleshooting"
				icon={<CodeIcon />}
				title="Tracking Setup"
			/>

			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
				<WebsiteTrackingSetupTab websiteId={websiteId} />
			</div>
		</div>
	);
}
