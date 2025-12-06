"use client";

import { FunnelIcon, TrendDownIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { FeatureGate } from "@/components/feature-gate";
import { GATED_FEATURES } from "@/components/providers/billing-provider";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteDialog } from "@/components/ui/delete-dialog";
import { useDateFilters } from "@/hooks/use-date-filters";
import {
	type CreateFunnelData,
	useAutocompleteData,
	useFunnelAnalytics,
	useFunnelAnalyticsByReferrer,
	useFunnelPerformance,
	useFunnels,
} from "@/hooks/use-funnels";
import { useTrackingSetup } from "@/hooks/use-tracking-setup";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import type { FunnelAnalyticsData } from "@/types/funnels";
import { WebsitePageHeader } from "../_components/website-page-header";
import {
	FunnelAnalytics,
	FunnelAnalyticsByReferrer,
	type FunnelItemData,
	FunnelItemSkeleton,
	FunnelsList,
} from "./_components";

// Only dialogs are lazy loaded since they're conditionally rendered
const EditFunnelDialog = dynamic(
	() =>
		import("./_components/edit-funnel-dialog").then((m) => ({
			default: m.EditFunnelDialog,
		})),
	{ ssr: false }
);

function FunnelsListSkeleton() {
	return (
		<div>
			{[1, 2, 3].map((i) => (
				<FunnelItemSkeleton key={i} />
			))}
		</div>
	);
}

export default function FunnelsPage() {
	const { id } = useParams();
	const websiteId = id as string;
	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const [expandedFunnelId, setExpandedFunnelId] = useState<string | null>(null);
	const [selectedReferrer, setSelectedReferrer] = useState("all");
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingFunnel, setEditingFunnel] = useState<FunnelItemData | null>(
		null
	);
	const [deletingFunnelId, setDeletingFunnelId] = useState<string | null>(null);

	const { refetchTrackingSetup } = useTrackingSetup(websiteId);
	const { formattedDateRangeState, dateRange } = useDateFilters();

	const {
		data: funnels,
		isLoading: funnelsLoading,
		error: funnelsError,
		refetch: refetchFunnels,
		createFunnel,
		updateFunnel,
		deleteFunnel,
		isCreating,
		isUpdating,
	} = useFunnels(websiteId);

	// Preload analytics for all funnels
	const { data: performanceData, isLoading: performanceLoading } =
		useFunnelPerformance(websiteId, dateRange, !!funnels && funnels.length > 0);

	// Detailed analytics for expanded funnel
	const {
		data: analyticsData,
		isLoading: analyticsLoading,
		error: analyticsError,
		refetch: refetchAnalytics,
	} = useFunnelAnalytics(websiteId, expandedFunnelId ?? "", dateRange, {
		enabled: !!expandedFunnelId,
	});

	const {
		data: referrerAnalyticsData,
		isLoading: referrerAnalyticsLoading,
		error: referrerAnalyticsError,
		refetch: refetchReferrerAnalytics,
	} = useFunnelAnalyticsByReferrer(
		websiteId,
		expandedFunnelId ?? "",
		{
			start_date: formattedDateRangeState.startDate,
			end_date: formattedDateRangeState.endDate,
		},
		{ enabled: !!expandedFunnelId }
	);

	const autocompleteQuery = useAutocompleteData(websiteId);

	// Analytics map from preloaded data
	const analyticsMap = useMemo(() => {
		const map = new Map<string, FunnelAnalyticsData | null>();

		if (performanceData) {
			for (const perf of performanceData) {
				if (perf) {
					map.set(perf.funnelId, perf as FunnelAnalyticsData);
				}
			}
		}

		// Override with detailed data for expanded funnel
		if (expandedFunnelId && analyticsData) {
			map.set(expandedFunnelId, analyticsData);
		}

		return map;
	}, [performanceData, expandedFunnelId, analyticsData]);

	// Loading states
	const loadingAnalyticsIds = useMemo(() => {
		const set = new Set<string>();
		if (performanceLoading && funnels) {
			for (const funnel of funnels) {
				set.add(funnel.id);
			}
		}
		if (expandedFunnelId && analyticsLoading) {
			set.add(expandedFunnelId);
		}
		return set;
	}, [performanceLoading, funnels, expandedFunnelId, analyticsLoading]);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		try {
			const promises: Promise<unknown>[] = [
				refetchFunnels(),
				autocompleteQuery.refetch(),
				refetchTrackingSetup(),
			];
			if (expandedFunnelId) {
				promises.push(refetchAnalytics(), refetchReferrerAnalytics());
			}
			await Promise.all(promises);
		} catch (error) {
			console.error("Failed to refresh funnel data:", error);
		} finally {
			setIsRefreshing(false);
		}
	}, [
		refetchFunnels,
		refetchAnalytics,
		refetchReferrerAnalytics,
		autocompleteQuery.refetch,
		refetchTrackingSetup,
		expandedFunnelId,
		setIsRefreshing,
	]);

	const handleCreateFunnel = async (data: CreateFunnelData) => {
		try {
			await createFunnel(data);
			setIsDialogOpen(false);
			setEditingFunnel(null);
		} catch (error) {
			console.error("Failed to create funnel:", error);
		}
	};

	const handleUpdateFunnel = async (funnel: FunnelItemData) => {
		try {
			await updateFunnel({
				funnelId: funnel.id,
				updates: {
					name: funnel.name,
					description: funnel.description ?? "",
					steps: funnel.steps,
					filters: funnel.filters,
					ignoreHistoricData: funnel.ignoreHistoricData,
				},
			});
			setIsDialogOpen(false);
			setEditingFunnel(null);
		} catch (error) {
			console.error("Failed to update funnel:", error);
		}
	};

	const handleDeleteFunnel = async (funnelId: string) => {
		try {
			await deleteFunnel(funnelId);
			if (expandedFunnelId === funnelId) {
				setExpandedFunnelId(null);
			}
			setDeletingFunnelId(null);
		} catch (error) {
			console.error("Failed to delete funnel:", error);
		}
	};

	const handleToggleFunnel = (funnelId: string) => {
		setExpandedFunnelId(expandedFunnelId === funnelId ? null : funnelId);
		setSelectedReferrer("all");
	};

	const handleReferrerChange = (referrer: string) => {
		setSelectedReferrer(referrer);
	};

	if (funnelsError) {
		return (
			<div className="p-4">
				<Card className="border-destructive/20 bg-destructive/5">
					<CardContent className="pt-6">
						<div className="flex items-center gap-2">
							<TrendDownIcon
								className="size-5 text-destructive"
								weight="duotone"
							/>
							<p className="font-medium text-destructive">
								Error loading funnel data
							</p>
						</div>
						<p className="mt-2 text-destructive/80 text-sm">
							{funnelsError.message}
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<FeatureGate feature={GATED_FEATURES.FUNNELS}>
			<div className="relative flex h-full flex-col">
				<WebsitePageHeader
					createActionLabel="Create Funnel"
					description="Track user journeys and optimize conversion drop-off points"
					hasError={!!funnelsError}
					icon={
						<FunnelIcon
							className="size-6 text-accent-foreground"
							weight="duotone"
						/>
					}
					isLoading={funnelsLoading}
					isRefreshing={isRefreshing}
					onCreateAction={() => {
						setEditingFunnel(null);
						setIsDialogOpen(true);
					}}
					onRefreshAction={handleRefresh}
					subtitle={
						funnelsLoading
							? undefined
							: `${funnels.length} funnel${funnels.length !== 1 ? "s" : ""}`
					}
					title="Conversion Funnels"
					websiteId={websiteId}
				/>

				{funnelsLoading ? (
					<FunnelsListSkeleton />
				) : (
					<FunnelsList
						analyticsMap={analyticsMap}
						expandedFunnelId={expandedFunnelId}
						funnels={funnels ?? []}
						loadingAnalyticsIds={loadingAnalyticsIds}
						onCreateFunnel={() => {
							setEditingFunnel(null);
							setIsDialogOpen(true);
						}}
						onDeleteFunnel={setDeletingFunnelId}
						onEditFunnel={(funnel) => {
							setEditingFunnel(funnel);
							setIsDialogOpen(true);
						}}
						onToggleFunnel={handleToggleFunnel}
					>
						{(funnel) => {
							if (expandedFunnelId !== funnel.id) {
								return null;
							}

							return (
								<div className="space-y-4">
									<FunnelAnalyticsByReferrer
										data={referrerAnalyticsData}
										error={referrerAnalyticsError}
										isLoading={referrerAnalyticsLoading}
										onReferrerChange={handleReferrerChange}
									/>

									<FunnelAnalytics
										data={analyticsData}
										error={analyticsError as Error | null}
										isLoading={analyticsLoading}
										onRetry={refetchAnalytics}
										referrerAnalytics={
											referrerAnalyticsData?.referrer_analytics
										}
										selectedReferrer={selectedReferrer}
									/>
								</div>
							);
						}}
					</FunnelsList>
				)}

				{isDialogOpen && (
					<EditFunnelDialog
						autocompleteData={autocompleteQuery.data}
						funnel={
							editingFunnel
								? {
										...editingFunnel,
										createdAt: String(editingFunnel.createdAt),
										updatedAt: String(editingFunnel.updatedAt),
									}
								: null
						}
						isCreating={isCreating}
						isOpen={isDialogOpen}
						isUpdating={isUpdating}
						onClose={() => {
							setIsDialogOpen(false);
							setEditingFunnel(null);
						}}
						onCreate={handleCreateFunnel}
						onSubmit={handleUpdateFunnel}
					/>
				)}

				{!!deletingFunnelId && (
					<DeleteDialog
						confirmLabel="Delete Funnel"
						isOpen={!!deletingFunnelId}
						itemName="this funnel"
						onClose={() => setDeletingFunnelId(null)}
						onConfirm={() =>
							deletingFunnelId && handleDeleteFunnel(deletingFunnelId)
						}
						title="Delete Funnel"
					/>
				)}
			</div>
		</FeatureGate>
	);
}
