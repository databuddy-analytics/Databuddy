"use client";

import { authClient } from "@databuddy/auth/client";
import type { TFlag } from "@databuddy/shared/flags";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { Button } from "@databuddy/ui";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useFeatureGate } from "@/components/feature-gate";
import { insightQueries } from "@/lib/insight-api";
import type { NativeRecommendationIntent } from "./recommendation-guards";

const FlagSheet = dynamic(
	() =>
		import("@/app/(main)/websites/[id]/flags/_components/flag-sheet").then(
			(module) => module.FlagSheet
		),
	{ ssr: false }
);

type FeatureFlagCreateIntent = Extract<
	NativeRecommendationIntent,
	{ type: "feature_flag.create" }
>;

export function FeatureFlagRecommendationAction({
	action,
	recommendationId,
	websiteId,
}: {
	action: FeatureFlagCreateIntent;
	recommendationId: string;
	websiteId: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const queryClient = useQueryClient();
	const featureGate = useFeatureGate(GATED_FEATURES.FEATURE_FLAGS);
	const memberRole = authClient.useActiveMemberRole();
	const initialDraft = useMemo<TFlag>(
		() => ({
			defaultValue: action.draft.defaultValue,
			dependencies: [],
			description: action.draft.description ?? "",
			environment: undefined,
			key: action.draft.key,
			name: action.draft.name,
			rolloutBy: undefined,
			rolloutPercentage: 0,
			rules: [],
			status: "active",
			targetGroupIds: [],
			type: "boolean",
			variants: [],
		}),
		[action.draft]
	);
	const accessReason =
		featureGate.isLoading || memberRole.isPending
			? "Checking access…"
			: featureGate.isEnabled
				? memberRole.data?.role === "viewer"
					? "You have view-only access to this website."
					: memberRole.data
						? null
						: "You need edit access to create this flag."
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
					Review flag draft
				</Button>
				{accessReason ? (
					<p className="text-muted-foreground text-xs">{accessReason}</p>
				) : null}
			</div>
			{isOpen ? (
				<FlagSheet
					initialDraft={initialDraft}
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
