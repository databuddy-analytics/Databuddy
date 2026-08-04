"use client";

import { authClient } from "@databuddy/auth/client";
import {
	GATED_FEATURES,
	type GatedFeatureId,
} from "@databuddy/shared/types/features";
import { Button } from "@databuddy/ui";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
import { useFeatureGate } from "@/components/feature-gate";
import { useAutocompleteData } from "@/hooks/use-autocomplete";
import {
	type CreateGoalData,
	type Goal,
	useGoalActions,
} from "@/hooks/use-goals";
import { useFunnelActions } from "@/hooks/use-funnels";
import type { CreateFunnelData } from "@/types/funnels";
import type { NativeRecommendationIntent } from "./recommendation-guards";

const EditGoalDialog = dynamic(
	() =>
		import(
			"@/app/(main)/websites/[id]/goals/_components/edit-goal-dialog"
		).then((module) => module.EditGoalDialog),
	{ ssr: false }
);

const EditFunnelDialog = dynamic(
	() =>
		import(
			"@/app/(main)/websites/[id]/funnels/_components/edit-funnel-dialog"
		).then((module) => module.EditFunnelDialog),
	{ ssr: false }
);

type ConversionDraftIntent = Extract<
	NativeRecommendationIntent,
	{ type: "funnel.create" | "goal.create" }
>;

interface DraftCreationAccess {
	canCreate: boolean;
	reason: string | null;
}

export function ConversionDraftRecommendationAction({
	action,
	recommendationId,
	websiteId,
}: {
	action: ConversionDraftIntent;
	recommendationId: string;
	websiteId: string;
}) {
	const feature =
		action.type === "goal.create"
			? GATED_FEATURES.GOALS
			: GATED_FEATURES.FUNNELS;
	const creationAccess = useDraftCreationAccess(feature);

	if (action.type === "goal.create") {
		return (
			<GoalDraftAction
				action={action}
				creationAccess={creationAccess}
				recommendationId={recommendationId}
				websiteId={websiteId}
			/>
		);
	}

	return (
		<FunnelDraftAction
			action={action}
			creationAccess={creationAccess}
			recommendationId={recommendationId}
			websiteId={websiteId}
		/>
	);
}

export function InstrumentationRecommendationDetails({
	events,
}: {
	events: Array<{ description: string; name: string }>;
}) {
	return (
		<ul className="mt-2 space-y-1.5 text-muted-foreground text-xs leading-relaxed">
			{events.map((event) => (
				<li key={event.name}>
					<span className="font-medium text-foreground/85">{event.name}</span>
					<span className="mx-1">—</span>
					{event.description}
				</li>
			))}
		</ul>
	);
}

function GoalDraftAction({
	action,
	creationAccess,
	recommendationId,
	websiteId,
}: {
	action: Extract<ConversionDraftIntent, { type: "goal.create" }>;
	creationAccess: DraftCreationAccess;
	recommendationId: string;
	websiteId: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const autocomplete = useAutocompleteData(websiteId, isOpen);
	const { createGoal, isCreating } = useGoalActions(websiteId);

	const handleSave = async (data: Goal | Omit<CreateGoalData, "websiteId">) => {
		try {
			const goalInput: CreateGoalData = {
				description: data.description ?? null,
				filters: data.filters ?? undefined,
				ignoreHistoricData: data.ignoreHistoricData,
				name: data.name,
				target: data.target,
				type: data.type,
				websiteId,
			};
			await createGoal(goalInput, recommendationId);
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not create the goal"
			);
		}
	};

	return (
		<>
			<DraftReviewButton
				access={creationAccess}
				label="goal"
				onClick={() => setIsOpen(true)}
			/>
			{isOpen ? (
				<EditGoalDialog
					autocompleteData={autocomplete.data}
					goal={null}
					initialDraft={action.draft}
					isOpen
					isSaving={isCreating}
					onClose={() => setIsOpen(false)}
					onSave={handleSave}
				/>
			) : null}
		</>
	);
}

function FunnelDraftAction({
	action,
	creationAccess,
	recommendationId,
	websiteId,
}: {
	action: Extract<ConversionDraftIntent, { type: "funnel.create" }>;
	creationAccess: DraftCreationAccess;
	recommendationId: string;
	websiteId: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const autocomplete = useAutocompleteData(websiteId, isOpen);
	const { createAction, isCreating } = useFunnelActions(websiteId);

	const handleCreate = async (data: CreateFunnelData) => {
		try {
			await createAction(data, recommendationId);
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not create the funnel"
			);
			throw error;
		}
	};

	return (
		<>
			<DraftReviewButton
				access={creationAccess}
				label="funnel"
				onClick={() => setIsOpen(true)}
			/>
			{isOpen ? (
				<EditFunnelDialog
					autocompleteData={autocomplete.data}
					funnel={null}
					initialDraft={action.draft}
					isCreating={isCreating}
					isOpen
					isUpdating={false}
					onClose={() => setIsOpen(false)}
					onCreate={handleCreate}
					onSubmit={() => Promise.resolve()}
				/>
			) : null}
		</>
	);
}

function DraftReviewButton({
	access,
	label,
	onClick,
}: {
	access: DraftCreationAccess;
	label: "funnel" | "goal";
	onClick: () => void;
}) {
	return (
		<div className="space-y-1.5">
			<Button
				disabled={!access.canCreate}
				onClick={onClick}
				size="sm"
				title={access.reason ?? undefined}
				type="button"
			>
				Review {label} draft
			</Button>
			{access.reason ? (
				<p className="text-muted-foreground text-xs">{access.reason}</p>
			) : null}
		</div>
	);
}

function useDraftCreationAccess(feature: GatedFeatureId): DraftCreationAccess {
	const featureGate = useFeatureGate(feature);
	const memberRole = authClient.useActiveMemberRole();

	if (featureGate.isLoading || memberRole.isPending) {
		return { canCreate: false, reason: "Checking access…" };
	}
	if (!featureGate.isEnabled) {
		return {
			canCreate: false,
			reason:
				featureGate.upgradeMessage ??
				`${featureGate.featureName} are not available on this plan.`,
		};
	}
	if (memberRole.data?.role === "viewer") {
		return {
			canCreate: false,
			reason: "You have view-only access to this website.",
		};
	}
	if (!memberRole.data) {
		return {
			canCreate: false,
			reason: "You need edit access to create this.",
		};
	}

	return { canCreate: true, reason: null };
}
