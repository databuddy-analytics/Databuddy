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
import { useWebsites } from "@/hooks/use-websites";
import {
	clearInsightsHistory,
	INSIGHT_QUERY_KEYS,
	type InsightsAiResponse,
	type InsightsHistoryPage,
} from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { FileTextIcon } from "@phosphor-icons/react/dist/ssr/FileText";
import { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { SparkleIcon } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { TrashIcon } from "@phosphor-icons/react/dist/ssr/Trash";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useOrgDimensions } from "../hooks/use-org-dimensions";
import { insightsRangeAtom } from "../lib/time-range";
import { CockpitNarrative } from "./cockpit-narrative";
import { CockpitSignals } from "./cockpit-signals";
import type { DimensionRow } from "./dimension-tile";
import { DimensionTile } from "./dimension-tile";
import { KpiRow } from "./kpi-row";
import { SiteHealthGrid } from "./site-health-grid";
import { TimeRangeSelector } from "./time-range-selector";

function countryFlag(code: string): string {
	if (code.length !== 2) {
		return "🌐";
	}
	const upper = code.toUpperCase();
	const a = upper.codePointAt(0);
	const b = upper.codePointAt(1);
	if (a === undefined || b === undefined) {
		return "🌐";
	}
	return String.fromCodePoint(a + 127_397, b + 127_397);
}

function renderCountryIcon(row: DimensionRow) {
	return <span className="text-base leading-none">{countryFlag(row.key)}</span>;
}

export function InsightsPageContent() {
	const queryClient = useQueryClient();
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const { insights, isLoading, isRefreshing, refetch } = useInsightsFeed();

	const range = useAtomValue(insightsRangeAtom);
	const { websites, isLoading: websitesLoading } = useWebsites();
	const dimensionsQuery = useOrgDimensions(range);

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

	const hasNoWebsites =
		!websitesLoading && websites !== undefined && websites.length === 0;

	return (
		<>
			<div
				aria-busy={isLoading || dimensionsQuery.isLoading || websitesLoading}
				className="h-full overflow-y-auto"
			>
				<PageHeader
					count={isLoading ? undefined : insights.length}
					description="Understand your business at a glance"
					icon={<SparkleIcon weight="duotone" />}
					right={
						<div className="flex items-center gap-2">
							<TimeRangeSelector />
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

				{hasNoWebsites ? (
					<EmptyOrgState />
				) : (
					<>
						<CockpitNarrative />
						<KpiRow />
						<SiteHealthGrid />
						<CockpitSignals />
						<section
							aria-label="Explore dimensions"
							className="border-b px-4 py-4 sm:px-6"
						>
							<div className="mb-3 flex items-center">
								<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Explore dimensions
								</span>
							</div>
							<div className="grid gap-3 lg:grid-cols-3">
								<DimensionTile
									icon={GlobeIcon}
									isError={dimensionsQuery.isError}
									isLoading={dimensionsQuery.isLoading}
									onRetry={() => dimensionsQuery.refetch()}
									renderRowIcon={renderCountryIcon}
									rows={dimensionsQuery.data?.countries}
									title="Top countries"
								/>
								<DimensionTile
									icon={FileTextIcon}
									isError={dimensionsQuery.isError}
									isLoading={dimensionsQuery.isLoading}
									onRetry={() => dimensionsQuery.refetch()}
									rows={dimensionsQuery.data?.pages}
									title="Top pages"
								/>
								<DimensionTile
									icon={LinkIcon}
									isError={dimensionsQuery.isError}
									isLoading={dimensionsQuery.isLoading}
									onRetry={() => dimensionsQuery.refetch()}
									rows={dimensionsQuery.data?.referrers}
									title="Top referrers"
								/>
							</div>
						</section>
					</>
				)}
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

function EmptyOrgState() {
	return (
		<div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
			<div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent">
				<GlobeIcon className="size-6 text-muted-foreground" weight="duotone" />
			</div>
			<div className="space-y-1">
				<p className="font-medium text-foreground">No websites yet</p>
				<p className="text-muted-foreground text-sm">
					Add a website to see insights across your organization.
				</p>
			</div>
			<Link
				className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-90"
				href="/websites"
			>
				Go to websites
			</Link>
		</div>
	);
}
