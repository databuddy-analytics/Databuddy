"use client";

import { useParams } from "next/navigation";
import { WebsiteTrackingSetupTab } from "../../_components/tabs/tracking-setup-tab";

export default function TrackingSetupPage() {
	const params = useParams();
	const websiteId = params.id as string;

	return (
		<div className="flex-1 overflow-y-auto">
			<div className="mx-auto max-w-4xl space-y-6 p-5">
				<WebsiteTrackingSetupTab websiteId={websiteId} />
			</div>
		</div>
	);
}
