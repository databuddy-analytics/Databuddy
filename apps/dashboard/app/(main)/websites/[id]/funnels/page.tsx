"use client";

import { FeatureGate, usePlanLimitMessage } from "@/components/feature-gate";
import { List } from "@/components/ui/composables/list";
import { insightDefinitionEditChangesSchema } from "@databuddy/shared/insights";
import { useAutocompleteData } from "@/hooks/use-autocomplete";
import { useDateFilters } from "@/hooks/use-date-filters";
import {
	useFunnelAnalytics,
	useFunnelAnalyticsByReferrer,
	useFunnels,
} from "@/hooks/use-funnels";
import type { CreateFunnelData } from "@/types/funnels";
import { cn } from "@/lib/utils";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import dynamic from "next/dynamic";
import {
	useParams,
	usePathname,
	useRouter,
	useSearchParams,
} from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/top-bar";
import {
	FunnelAnalytics,
	FunnelAnalyticsByReferrer,
	type FunnelItemData,
	FunnelItemSkeleton,
	FunnelsList,
} from "./_components";
import { ArrowClockwiseIcon, FunnelIcon, PlusIcon } from "@databuddy/ui/icons";
import { Button } from "@databuddy/ui";
import { DeleteDialog } from "@databuddy/ui/client";

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
	const pathname = usePathname();
	const isDemoRoute = pathname.startsWith("/demo/");
	const { formattedDateRangeState, dateRange } = useDateFilters();

	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [selectedReferrer, setSelectedReferrer] = useState("all");
	const [editing, setEditing] = useState<FunnelItemData | "new" | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const router = useRouter();
	const searchParams = useSearchParams();

	useEffect(() => {
		if (!isDemoRoute && searchParams.get("new") === "funnel") {
			setEditing("new");
			const params = new URLSearchParams(searchParams);
			params.delete("new");
			const query = params.toString();
			router.replace(query ? `${pathname}?${query}` : pathname);
		}
	}, [searchParams, router, pathname, isDemoRoute]);

	const {
		analyticsMap,
		funnels,
		loadingIds,
		listOutcome,
		isFetching,
		error,
		refreshAction,
		createAction,
		updateAction,
		deleteAction,
		isCreating,
		isUpdating,
	} = useFunnels(websiteId, { dateRange });

	const planLimitMessage = usePlanLimitMessage(
		GATED_FEATURES.FUNNELS,
		funnels.length
	);

	const openCreate = () => {
		if (planLimitMessage) {
			toast.info(planLimitMessage);
			return;
		}
		setEditing("new");
	};

	useEffect(() => {
		const command = searchParams.get("command");
		const funnelId = searchParams.get("funnelId");
		if (
			isDemoRoute ||
			!funnelId ||
			(command !== "edit-funnel" && command !== "delete-funnel") ||
			isFetching ||
			listOutcome.status === "loading" ||
			listOutcome.status === "error"
		) {
			return;
		}

		const funnel = funnels.find((candidate) => candidate.id === funnelId);
		if (!funnel) {
			toast.error("This funnel no longer exists");
		} else if (command === "edit-funnel") {
			const proposal = insightDefinitionEditChangesSchema.safeParse({
				description: searchParams.get("description"),
				name: searchParams.get("name"),
			});
			if (proposal.success) {
				const proposedFunnel = {
					...funnel,
					description: proposal.data.description ?? funnel.description,
					name: proposal.data.name ?? funnel.name,
				};
				if (
					proposedFunnel.description === funnel.description &&
					proposedFunnel.name === funnel.name
				) {
					toast.success("This funnel already matches the recommendation");
				} else {
					setEditing(proposedFunnel);
				}
			} else {
				toast.error("Databuddy's suggested changes could not be loaded");
			}
		} else {
			setDeletingId(funnel.id);
		}

		const params = new URLSearchParams(searchParams.toString());
		params.delete("command");
		params.delete("description");
		params.delete("funnelId");
		params.delete("name");
		const query = params.toString();
		router.replace(query ? `${pathname}?${query}` : pathname, {
			scroll: false,
		});
	}, [
		funnels,
		isDemoRoute,
		isFetching,
		listOutcome.status,
		pathname,
		router,
		searchParams,
	]);

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
		} catch {}
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
		} catch {}
	};

	const handleDelete = async (funnelId: string) => {
		try {
			await deleteAction(funnelId);
			if (expandedId === funnelId) {
				setExpandedId(null);
			}
			setDeletingId(null);
		} catch {}
	};

	return (
		<FeatureGate feature={GATED_FEATURES.FUNNELS}>
			<div className="relative flex h-full flex-col">
				<TopBar.Title>
					<h1 className="font-semibold text-sm">Conversion Funnels</h1>
				</TopBar.Title>
				<TopBar.Actions>
					<Button
						aria-label="Refresh"
						disabled={isFetching}
						onClick={refreshAction}
						size="sm"
						variant="secondary"
					>
						<ArrowClockwiseIcon
							className={cn("size-4 shrink-0", isFetching && "animate-spin")}
						/>
					</Button>
					{!isDemoRoute && (
						<Button onClick={openCreate} size="sm">
							<PlusIcon className="size-4 shrink-0" />
							Create Funnel
						</Button>
					)}
				</TopBar.Actions>

				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					<List.Content
						emptyProps={{
							action: isDemoRoute
								? undefined
								: {
										label: "Create a funnel",
										onClick: openCreate,
									},
							description:
								"Define a multi-step journey to see where users drop off.",
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
								readOnly={isDemoRoute}
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

				{!isDemoRoute && editing !== null && (
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

				{!isDemoRoute && !!deletingId && (
					<DeleteDialog
						confirmLabel="Delete Funnel"
						isOpen={!!deletingId}
						itemName="this funnel"
						onClose={() => setDeletingId(null)}
						onConfirm={() => {
							if (deletingId) {
								return handleDelete(deletingId);
							}
						}}
						title="Delete Funnel"
					/>
				)}
			</div>
		</FeatureGate>
	);
}
