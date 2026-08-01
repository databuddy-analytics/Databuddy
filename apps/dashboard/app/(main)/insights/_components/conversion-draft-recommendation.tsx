"use client";

import { authClient } from "@databuddy/auth/client";
import type { InsightMeasurementRecommendation } from "@databuddy/shared/insights";
import {
	GATED_FEATURES,
	type GatedFeatureId,
} from "@databuddy/shared/types/features";
import { Button } from "@databuddy/ui";
import { CheckCircleIcon } from "@databuddy/ui/icons";
import dynamic from "next/dynamic";
import Link from "next/link";
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

type GoalDraftRecommendation = Extract<
	InsightMeasurementRecommendation,
	{ kind: "goal_draft" }
>;
type FunnelDraftRecommendation = Extract<
	InsightMeasurementRecommendation,
	{ kind: "funnel_draft" }
>;
type ConversionDraftRecommendation =
	| GoalDraftRecommendation
	| FunnelDraftRecommendation;
type InstrumentationRecommendation = Extract<
	InsightMeasurementRecommendation,
	{ kind: "instrumentation" }
>;

interface DraftCreationAccess {
	canCreate: boolean;
	reason: string | null;
}

interface CreatedDraft {
	id: string;
	name: string;
}

export function ConversionDraftRecommendationAction({
	recommendation,
	websiteId,
}: {
	recommendation: ConversionDraftRecommendation;
	websiteId: string;
}) {
	const feature =
		recommendation.kind === "goal_draft"
			? GATED_FEATURES.GOALS
			: GATED_FEATURES.FUNNELS;
	const creationAccess = useDraftCreationAccess(feature);

	if (recommendation.kind === "goal_draft") {
		return (
			<GoalDraftAction
				creationAccess={creationAccess}
				recommendation={recommendation}
				websiteId={websiteId}
			/>
		);
	}

	return (
		<FunnelDraftAction
			creationAccess={creationAccess}
			recommendation={recommendation}
			websiteId={websiteId}
		/>
	);
}

export function InstrumentationRecommendationDetails({
	recommendation,
}: {
	recommendation: InstrumentationRecommendation;
}) {
	return (
		<ul className="mt-2 space-y-1.5 text-muted-foreground text-xs leading-relaxed">
			{recommendation.events.map((event) => (
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
	creationAccess,
	recommendation,
	websiteId,
}: {
	creationAccess: DraftCreationAccess;
	recommendation: GoalDraftRecommendation;
	websiteId: string;
}) {
	const [createdGoal, setCreatedGoal] = useState<CreatedDraft | null>(null);
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
			const goal = await createGoal(goalInput);
			setIsOpen(false);
			setCreatedGoal({ id: goal.id, name: goal.name });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not create the goal"
			);
		}
	};

	if (createdGoal) {
		return (
			<CreatedDraftLink
				href={`/websites/${encodeURIComponent(websiteId)}/goals#goal-${encodeURIComponent(createdGoal.id)}`}
				label="Goal"
				name={createdGoal.name}
			/>
		);
	}

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
					initialDraft={recommendation.draft}
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
	creationAccess,
	recommendation,
	websiteId,
}: {
	creationAccess: DraftCreationAccess;
	recommendation: FunnelDraftRecommendation;
	websiteId: string;
}) {
	const [createdFunnel, setCreatedFunnel] = useState<CreatedDraft | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const autocomplete = useAutocompleteData(websiteId, isOpen);
	const { createAction, isCreating } = useFunnelActions(websiteId);

	const handleCreate = async (data: CreateFunnelData) => {
		try {
			const funnel = await createAction(data);
			setIsOpen(false);
			setCreatedFunnel({ id: funnel.id, name: funnel.name });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Could not create the funnel"
			);
			throw error;
		}
	};

	if (createdFunnel) {
		return (
			<CreatedDraftLink
				href={`/websites/${encodeURIComponent(websiteId)}/funnels#funnel-${encodeURIComponent(createdFunnel.id)}`}
				label="Funnel"
				name={createdFunnel.name}
			/>
		);
	}

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
					initialDraft={recommendation.draft}
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
				variant="secondary"
			>
				Review {label} draft
			</Button>
			{access.reason ? (
				<p className="text-muted-foreground text-xs">{access.reason}</p>
			) : null}
		</div>
	);
}

function CreatedDraftLink({
	href,
	label,
	name,
}: {
	href: string;
	label: "Funnel" | "Goal";
	name: string;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="inline-flex items-center gap-1.5 font-medium text-sm text-success">
				<CheckCircleIcon className="size-4" weight="fill" />
				{name} created
			</span>
			<Button asChild size="sm" type="button" variant="secondary">
				<Link href={href}>View {label.toLowerCase()}</Link>
			</Button>
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
