"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useInsightsFeed } from "@/app/(main)/insights/hooks/use-insights-feed";
import { useInsightsLocalState } from "@/app/(main)/insights/hooks/use-insights-local-state";
import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsitesLight } from "@/hooks/use-websites";
import {
	clearInsightsHistory,
	insightQueries,
	type InsightsAiResponse,
	type InsightsHistoryPage,
} from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { CockpitNarrative } from "./cockpit-narrative";
import { CockpitSignals } from "./cockpit-signals";
import { InsightGenerationSettings } from "./insight-generation-settings";
import { TimeRangeSelector } from "./time-range-selector";
import { ArrowClockwiseIcon, GlobeIcon, TrashIcon } from "@databuddy/ui/icons";
import { DeleteDialog } from "@databuddy/ui/client";
import { Button, EmptyState } from "@databuddy/ui";

export function InsightsPageContent() {
	const queryClient = useQueryClient();
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const { insights, isLoading, isRefreshing, refetch } = useInsightsFeed();

	const { websites, isLoading: websitesLoading } = useWebsitesLight();

	const insightIdsForVotes = useMemo(
		() => insights.map((i) => i.id),
		[insights]
	);

	const { clearAllDismissedAction } = useInsightsLocalState(
		orgId,
		insightIdsForVotes
	);

	const [clearDialogOpen, setClearDialogOpen] = useState(false);

	const clearInsightsMutation = useMutation({
		mutationFn: () => clearInsightsHistory(orgId ?? ""),
		onSuccess: async (data) => {
			setClearDialogOpen(false);
			clearAllDismissedAction();
			if (orgId) {
				const emptyAi: InsightsAiResponse = {
					success: true,
					insights: [],
					source: "ai",
				};
				const emptyHistoryPage: InsightsHistoryPage = {
					success: true,
					insights: [],
					hasMore: false,
				};
				queryClient.setQueryData<InsightsAiResponse>(
					insightQueries.ai(orgId).queryKey,
					emptyAi
				);
				queryClient.setQueryData(
					insightQueries.historyInfinite(orgId).queryKey,
					{ pages: [emptyHistoryPage], pageParams: [0] }
				);
				await queryClient.invalidateQueries({
					queryKey: orpc.insights.getVotes.key(),
				});
			}
			toast.success(
				data.deleted === 0
					? "No stored insights to remove"
					: `Removed ${data.deleted} insight${data.deleted === 1 ? "" : "s"}`
			);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Could not clear insights"
			);
		},
	});

	const handleRefreshAll = useCallback(() => {
		refetch();
	}, [refetch]);

	const hasNoWebsites =
		!websitesLoading && websites !== undefined && websites.length === 0;

	return (
		<>
			<div
				aria-busy={isLoading || websitesLoading}
				className="flex h-full flex-col overflow-y-auto"
			>
				<TopBar.Title>
					<h1 className="font-semibold text-sm">Insights</h1>
				</TopBar.Title>
				<TopBar.Actions>
					<TimeRangeSelector />
					<Button
						aria-label="Refresh insights"
						disabled={isLoading || websitesLoading}
						onClick={handleRefreshAll}
						size="sm"
						type="button"
						variant="secondary"
					>
						<ArrowClockwiseIcon
							aria-hidden
							className={cn("size-4 shrink-0", isRefreshing && "animate-spin")}
						/>
					</Button>
					<Button
						disabled={!orgId || clearInsightsMutation.isPending}
						onClick={() => setClearDialogOpen(true)}
						size="sm"
						type="button"
						variant="secondary"
					>
						<TrashIcon className="size-4 shrink-0" weight="duotone" />
						Clear all
					</Button>
					<InsightGenerationSettings
						organizationId={orgId}
						websites={websites}
					/>
				</TopBar.Actions>

				{hasNoWebsites ? (
					<EmptyOrgState />
				) : (
					<div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-5">
						<CockpitNarrative />
						<CockpitSignals />
					</div>
				)}
			</div>

			<DeleteDialog
				confirmDisabled={!orgId}
				confirmLabel="Clear all"
				description="This removes every stored insight for this organization from the database. Fresh insights will be generated on the next analysis run."
				isDeleting={clearInsightsMutation.isPending}
				isOpen={clearDialogOpen}
				onClose={() => setClearDialogOpen(false)}
				onConfirm={async () => {
					if (orgId) {
						await clearInsightsMutation.mutateAsync();
					}
				}}
				title="Clear all insights?"
			/>
		</>
	);
}

function EmptyOrgState() {
	return (
		<EmptyState
			action={{
				label: "Go to websites",
				onClick: () => {
					window.location.href = "/websites";
				},
			}}
			description="Add a website to see insights across your organization."
			icon={<GlobeIcon weight="duotone" />}
			title="No websites yet"
			variant="minimal"
		/>
	);
}
