"use client";

import { useInsightsFeed } from "@/app/(main)/insights/hooks/use-insights-feed";
import { useInsightsLocalState } from "@/app/(main)/insights/hooks/use-insights-local-state";
import { PageHeader } from "@/app/(main)/websites/_components/page-header";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	clearInsightsHistory,
	INSIGHT_QUERY_KEYS,
	type InsightsAiResponse,
	type InsightsHistoryPage,
} from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { SparkleIcon } from "@phosphor-icons/react";
import { TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CockpitSignals } from "./cockpit-signals";

export function InsightsPageContent() {
	const queryClient = useQueryClient();
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const { insights, isLoading, isRefreshing, refetch } = useInsightsFeed();

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
					[INSIGHT_QUERY_KEYS.ai, orgId],
					emptyAi
				);
				queryClient.setQueryData([INSIGHT_QUERY_KEYS.historyInfinite, orgId], {
					pages: [emptyHistoryPage],
					pageParams: [0],
				});
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

	return (
		<>
			<div className="h-full overflow-y-auto">
				<PageHeader
					count={isLoading ? undefined : insights.length}
					description="Week-over-week AI analysis across all your websites"
					icon={<SparkleIcon weight="duotone" />}
					right={
						<div className="flex items-center gap-2">
							<Button
								aria-label="Refresh insights"
								disabled={isLoading}
								onClick={() => refetch()}
								size="icon"
								type="button"
								variant="outline"
							>
								<ArrowClockwiseIcon
									aria-hidden
									className={cn("size-4", isRefreshing && "animate-spin")}
								/>
							</Button>
							<Button
								disabled={!orgId || clearInsightsMutation.isPending}
								onClick={() => setClearDialogOpen(true)}
								type="button"
								variant="outline"
							>
								<TrashIcon className="size-4" weight="duotone" />
								Clear all
							</Button>
						</div>
					}
					title="Insights"
				/>

				<CockpitSignals />
			</div>

			<AlertDialog onOpenChange={setClearDialogOpen} open={clearDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="text-balance">
							Clear all insights?
						</AlertDialogTitle>
						<AlertDialogDescription className="text-pretty">
							This removes every stored insight for this organization from the
							database. Fresh insights will be generated on the next analysis
							run.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={clearInsightsMutation.isPending || !orgId}
							onClick={(e) => {
								e.preventDefault();
								if (orgId) {
									clearInsightsMutation.mutate();
								}
							}}
							type="button"
						>
							{clearInsightsMutation.isPending ? "Clearing…" : "Clear all"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
