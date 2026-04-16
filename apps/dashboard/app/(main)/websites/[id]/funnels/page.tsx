"use client";

import { FeatureGate } from "@/components/feature-gate";
import { List } from "@/components/ui/composables/list";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { useAutocompleteData } from "@/hooks/use-autocomplete";
import { useDateFilters } from "@/hooks/use-date-filters";
import {
	useFunnelAnalytics,
	useFunnelAnalyticsByReferrer,
	useFunnels,
} from "@/hooks/use-funnels";
import type { CreateFunnelData } from "@/types/funnels";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { FunnelIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useState } from "react";
import { WebsitePageHeader } from "../_components/website-page-header";
import {
	FunnelAnalytics,
	FunnelAnalyticsByReferrer,
	type FunnelItemData,
	FunnelItemSkeleton,
	FunnelsList,
} from "./_components";

const EditFunnelDialog = dynamic(
	() =>
		import("./_components/edit-funnel-dialog").then((m) => ({
			default: m.EditFunnelDialog,
		})),
	{ ssr: false }
);

function FunnelsListSkeleton() {
	return (
		<List className="rounded bg-card">
			{[1, 2, 3].map((i) => (
				<FunnelItemSkeleton key={i} />
			))}
		</List>
	);
}

export default function FunnelsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const { formattedDateRangeState, dateRange } = useDateFilters();

	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [selectedReferrer, setSelectedReferrer] = useState("all");
	const [editing, setEditing] = useState<FunnelItemData | "new" | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const {
		funnels,
		analyticsMap,
		loadingIds,
		listOutcome,
		isLoading,
		isFetching,
		error,
		refreshAction,
		createAction,
		updateAction,
		deleteAction,
		isCreating,
		isUpdating,
	} = useFunnels(websiteId, { dateRange });

	const {
		data: analyticsData,
		isLoading: analyticsLoading,
		error: analyticsError,
		refetch: refetchAnalytics,
	} = useFunnelAnalytics(websiteId, expandedId ?? "", dateRange, {
		enabled: !!expandedId,
	});

	const {
		data: referrerData,
		isLoading: referrerLoading,
		error: referrerError,
	} = useFunnelAnalyticsByReferrer(
		websiteId,
		expandedId ?? "",
		{
			start_date: formattedDateRangeState.startDate,
			end_date: formattedDateRangeState.endDate,
		},
		{ enabled: !!expandedId }
	);

	const autocomplete = useAutocompleteData(websiteId);

	const handleCreate = async (data: CreateFunnelData) => {
		try {
			await createAction(data);
			setEditing(null);
		} catch (err) {
			console.error("Failed to create funnel:", err);
		}
	};

	const handleUpdate = async (funnel: FunnelItemData) => {
		try {
			await updateAction(funnel.id, {
				name: funnel.name,
				description: funnel.description ?? "",
				steps: funnel.steps,
				filters: funnel.filters,
				ignoreHistoricData: funnel.ignoreHistoricData,
			});
			setEditing(null);
		} catch (err) {
			console.error("Failed to update funnel:", err);
		}
	};

	const handleDelete = async (funnelId: string) => {
		try {
			await deleteAction(funnelId);
			if (expandedId === funnelId) {
				setExpandedId(null);
			}
			setDeletingId(null);
		} catch (err) {
			console.error("Failed to delete funnel:", err);
		}
	};

	return (
		<FeatureGate feature={GATED_FEATURES.FUNNELS}>
			<div className="relative flex h-full flex-col">
				<WebsitePageHeader
					createActionLabel="Create Funnel"
					currentUsage={funnels.length}
					description="Track user journeys and optimize conversion drop-off points"
					feature={GATED_FEATURES.FUNNELS}
					hasError={listOutcome.status === "error"}
					icon={<FunnelIcon className="size-6" weight="duotone" />}
					isLoading={isLoading}
					isRefreshing={isFetching}
					onCreateAction={() => setEditing("new")}
					onRefreshAction={refreshAction}
					subtitle={
						isLoading
							? undefined
							: `${funnels.length} funnel${funnels.length === 1 ? "" : "s"}`
					}
					title="Conversion Funnels"
					websiteId={websiteId}
				/>

				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					<List.Content
						emptyProps={{
							action: {
								label: "Create Your First Funnel",
								onClick: () => setEditing("new"),
							},
							description:
								"Create your first funnel to start tracking user conversion journeys and identify optimization opportunities in your user flow.",
							icon: <FunnelIcon className="size-6" weight="duotone" />,
							title: "No funnels yet",
						}}
						errorProps={{
							action: { label: "Retry", onClick: () => refreshAction() },
							description:
								error?.message ??
								"Something went wrong while loading funnel data.",
							icon: <FunnelIcon className="size-6" weight="duotone" />,
							title: "Failed to load funnels",
						}}
						loading={<FunnelsListSkeleton />}
						outcome={listOutcome}
					>
						{(items) => (
							<FunnelsList
								analyticsMap={analyticsMap}
								expandedFunnelId={expandedId}
								funnels={items}
								loadingAnalyticsIds={loadingIds}
								onDeleteFunnel={setDeletingId}
								onEditFunnel={(funnel) => setEditing(funnel)}
								onToggleFunnel={(funnelId) => {
									setExpandedId(expandedId === funnelId ? null : funnelId);
									setSelectedReferrer("all");
								}}
							>
								{(funnel) => {
									if (expandedId !== funnel.id) {
										return null;
									}

									return (
										<div className="space-y-4">
											<FunnelAnalyticsByReferrer
												data={referrerData}
												error={referrerError}
												isLoading={referrerLoading}
												onReferrerChange={setSelectedReferrer}
											/>

											<FunnelAnalytics
												data={analyticsData}
												error={analyticsError as Error | null}
												isLoading={analyticsLoading}
												onRetry={refetchAnalytics}
												referrerAnalytics={referrerData?.referrer_analytics}
												selectedReferrer={selectedReferrer}
											/>
										</div>
									);
								}}
							</FunnelsList>
						)}
					</List.Content>
				</div>

				{editing !== null && (
					<EditFunnelDialog
						autocompleteData={autocomplete.data}
						funnel={
							typeof editing === "object"
								? {
										...editing,
										createdAt: String(editing.createdAt),
										updatedAt: String(editing.updatedAt),
									}
								: null
						}
						isCreating={isCreating}
						isOpen
						isUpdating={isUpdating}
						onClose={() => setEditing(null)}
						onCreate={handleCreate}
						onSubmit={handleUpdate}
					/>
				)}

				{!!deletingId && (
					<DeleteDialog
						confirmLabel="Delete Funnel"
						isOpen={!!deletingId}
						itemName="this funnel"
						onClose={() => setDeletingId(null)}
						onConfirm={() => deletingId && handleDelete(deletingId)}
						title="Delete Funnel"
					/>
				)}
			</div>
		</FeatureGate>
	);
}
