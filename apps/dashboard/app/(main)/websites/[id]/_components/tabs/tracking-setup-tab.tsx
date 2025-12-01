"use client";

import { BookOpenIcon, ChatCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";
import {
	toggleTrackingOptionAtom,
	trackingOptionsAtom,
} from "@/stores/jotai/filterAtoms";
import {
	InfoSection,
	InstallationTabs,
	TrackingOptionsGrid,
	TrackingStatusCard,
} from "../shared/tracking-components";
import {
	ADVANCED_TRACKING_OPTIONS,
	BASIC_TRACKING_OPTIONS,
	COPY_SUCCESS_TIMEOUT,
} from "../shared/tracking-constants";
import { generateNpmCode, generateScriptTag } from "../utils/code-generators";

import type { TrackingOptions } from "../utils/types";

type TrackingSetupTabProps = {
	websiteId: string;
};

export function WebsiteTrackingSetupTab({ websiteId }: TrackingSetupTabProps) {
	const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
	const [trackingOptions] = useAtom(trackingOptionsAtom);

	const trackingCode = generateScriptTag(websiteId, trackingOptions);
	const npmCode = generateNpmCode(websiteId, trackingOptions);

	const handleCopyCode = (code: string, blockId: string, message: string) => {
		navigator.clipboard.writeText(code);
		setCopiedBlockId(blockId);
		toast.success(message);
		setTimeout(() => setCopiedBlockId(null), COPY_SUCCESS_TIMEOUT);
	};

	const [, toggleTrackingOptionAction] = useAtom(toggleTrackingOptionAtom);
	const handleToggleOption = (option: keyof TrackingOptions) => {
		toggleTrackingOptionAction(option);
	};

	const { data: trackingSetupData, refetch: refetchTrackingSetup } = useQuery({
		...orpc.websites.isTrackingSetup.queryOptions({ input: { websiteId } }),
		enabled: !!websiteId,
	});

	const handleRefresh = async () => {
		toast.success("Checking tracking status...");

		try {
			const result = await refetchTrackingSetup();

			if (result.data?.tracking_setup) {
				toast.success("Tracking setup correctly! Data is being collected.");
			} else {
				toast.error(
					"Tracking not found. Please verify the script installation."
				);
			}
		} catch (error) {
			console.error("Failed to check tracking status:", error);
			toast.error("Failed to check tracking status. Please try again.");
		}
	};

	return (
		<div className="space-y-4">
			{/* Tracking Status */}
			<TrackingStatusCard
				isSetup={trackingSetupData?.tracking_setup ?? false}
				onRefresh={handleRefresh}
			/>

			{/* Installation Instructions */}
			<InfoSection title="Installation">
				<div className="space-y-4">
					<p className="text-muted-foreground text-sm">
						Choose your preferred installation method
					</p>
					<InstallationTabs
						copiedBlockId={copiedBlockId}
						npmCode={npmCode}
						onCopyCode={handleCopyCode}
						trackingCode={trackingCode}
					/>
				</div>
			</InfoSection>

			<InfoSection title="Configuration">
				<p className="mb-4 text-muted-foreground text-xs">
					Customize tracking options (optional)
				</p>

				<div className="space-y-6">
					<TrackingOptionsGrid
						description="Configure what user activity and page data to collect"
						onToggleOption={handleToggleOption}
						options={BASIC_TRACKING_OPTIONS}
						title="Basic Tracking Options"
						trackingOptions={trackingOptions}
					/>

					<TrackingOptionsGrid
						description="Enable additional tracking features for deeper insights"
						onToggleOption={handleToggleOption}
						options={ADVANCED_TRACKING_OPTIONS}
						title="Advanced Tracking Features"
						trackingOptions={trackingOptions}
					/>
				</div>
			</InfoSection>

			{/* Help Links */}
			<div className="flex gap-2">
				<Button asChild size="sm" variant="outline">
					<a
						className="flex items-center gap-2"
						href="https://www.databuddy.cc/docs"
						rel="noopener noreferrer"
						target="_blank"
					>
						<BookOpenIcon className="h-4 w-4" weight="duotone" />
						Documentation
					</a>
				</Button>
				<Button asChild size="sm" variant="outline">
					<a
						className="flex items-center gap-2"
						href="mailto:support@databuddy.cc"
					>
						<ChatCircleIcon className="h-4 w-4" weight="duotone" />
						Support
					</a>
				</Button>
			</div>
		</div>
	);
}
