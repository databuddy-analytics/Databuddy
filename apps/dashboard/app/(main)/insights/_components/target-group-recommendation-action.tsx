"use client";

import { authClient } from "@databuddy/auth/client";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { Button } from "@databuddy/ui";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useFeatureGate } from "@/components/feature-gate";
import { insightQueries } from "@/lib/insight-api";
import type { NativeRecommendationIntent } from "./recommendation-guards";

const GroupSheet = dynamic(
	() =>
		import(
			"@/app/(main)/websites/[id]/flags/groups/_components/group-sheet"
		).then((module) => module.GroupSheet),
	{ ssr: false }
);

type TargetGroupCreateIntent = Extract<
	NativeRecommendationIntent,
	{ type: "target_group.create" }
>;

export function TargetGroupRecommendationAction({
	action,
	recommendationId,
	websiteId,
}: {
	action: TargetGroupCreateIntent;
	recommendationId: string;
	websiteId: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const queryClient = useQueryClient();
	const featureGate = useFeatureGate(GATED_FEATURES.FEATURE_FLAGS);
	const memberRole = authClient.useActiveMemberRole();
	const accessReason =
		featureGate.isLoading || memberRole.isPending
			? "Checking access…"
			: featureGate.isEnabled
				? memberRole.data?.role === "viewer"
					? "You have view-only access to this website."
					: memberRole.data
						? null
						: "You need edit access to create this group."
				: (featureGate.upgradeMessage ??
					"Feature flags are not available on this plan.");

	return (
		<>
			<div className="space-y-1.5">
				<Button
					disabled={Boolean(accessReason)}
					onClick={() => setIsOpen(true)}
					size="sm"
					title={accessReason ?? undefined}
					type="button"
				>
					Review group draft
				</Button>
				{accessReason ? (
					<p className="text-muted-foreground text-xs">{accessReason}</p>
				) : null}
			</div>
			{isOpen ? (
				<GroupSheet
					initialDraft={action.draft}
					isOpen
					onCloseAction={() => setIsOpen(false)}
					onSavedAction={() =>
						queryClient.invalidateQueries({ queryKey: insightQueries.all() })
					}
					recommendationId={recommendationId}
					websiteId={websiteId}
				/>
			) : null}
		</>
	);
}
