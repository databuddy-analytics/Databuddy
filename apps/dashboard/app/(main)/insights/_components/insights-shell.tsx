"use client";

import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { PageNavigation } from "@/components/layout/page-navigation";
import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsitesLight } from "@/hooks/use-websites";
import { insightQueries } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { Button, EmptyState } from "@databuddy/ui";
import {
	ArrowClockwiseIcon,
	GlobeIcon,
	LightbulbIcon,
	MagnifyingGlassIcon,
	WrenchIcon,
} from "@databuddy/ui/icons";
import { InvestigationSettings } from "./investigation-settings";
import { isActiveRun } from "../_lib/insight-run";

const INSIGHTS_LIST_ROUTES = new Set([
	"/insights",
	"/insights/investigations",
	"/insights/recommendations",
]);

export function InsightsShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	return INSIGHTS_LIST_ROUTES.has(pathname) ? (
		<InsightsListShell>{children}</InsightsListShell>
	) : (
		children
	);
}

function InsightsListShell({ children }: { children: ReactNode }) {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const organizationId =
		activeOrganization?.id ?? activeOrganizationId ?? undefined;
	const queryClient = useQueryClient();
	const insightsFetching = useIsFetching({ queryKey: insightQueries.all() });
	const latestRun = useQuery({
		...orpc.insightGeneration.getLatestRun.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(organizationId),
		meta: { suppressGlobalErrorToast: true },
		refetchInterval: (query) => {
			const failures = query.state.fetchFailureCount;
			if (failures > 0) {
				return Math.min(30_000 * 2 ** Math.min(failures - 1, 3), 5 * 60_000);
			}
			return isActiveRun(query.state.data?.status) ? 2000 : 30_000;
		},
	});
	const { websites, isLoading: websitesLoading } = useWebsitesLight();
	const hasNoWebsites =
		!websitesLoading && websites !== undefined && websites.length === 0;
	const refreshInsights = useCallback(() => {
		queryClient
			.invalidateQueries({ queryKey: insightQueries.all() })
			.catch(() => undefined);
	}, [queryClient]);
	const latestRunTracker = useRef<{
		organizationId: string;
		terminalRunId: string | null;
	} | null>(null);

	useEffect(() => {
		if (!organizationId) {
			latestRunTracker.current = null;
			return;
		}
		if (!latestRun.isSuccess) {
			if (latestRunTracker.current?.organizationId !== organizationId) {
				latestRunTracker.current = null;
			}
			return;
		}

		const run = latestRun.data;
		const tracked = latestRunTracker.current;
		if (!tracked || tracked.organizationId !== organizationId) {
			latestRunTracker.current = {
				organizationId,
				terminalRunId: run && !isActiveRun(run.status) ? run.id : null,
			};
			if (run && !isActiveRun(run.status)) {
				refreshInsights();
			}
			return;
		}
		if (!run || isActiveRun(run.status) || tracked.terminalRunId === run.id) {
			return;
		}

		latestRunTracker.current = {
			organizationId,
			terminalRunId: run.id,
		};
		refreshInsights();
	}, [latestRun.data, latestRun.isSuccess, organizationId, refreshInsights]);

	const isAnalyzing = isActiveRun(latestRun.data?.status);
	const refresh = () => {
		Promise.all([
			queryClient.invalidateQueries({ queryKey: insightQueries.all() }),
			latestRun.refetch(),
		]).catch(() => undefined);
	};

	return (
		<div className="flex h-full min-h-0 flex-col" aria-busy={websitesLoading}>
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Insights</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh insights"
					disabled={websitesLoading}
					onClick={refresh}
					size="sm"
					type="button"
					variant="ghost"
				>
					<ArrowClockwiseIcon
						aria-hidden
						className={cn(
							"size-3.5 shrink-0",
							(insightsFetching > 0 || latestRun.isFetching) && "animate-spin"
						)}
					/>
				</Button>
				<InvestigationSettings
					isAnalyzing={isAnalyzing}
					key={organizationId}
					organizationId={organizationId}
				/>
			</TopBar.Actions>

			<PageNavigation
				tabs={[
					{
						href: "/insights",
						icon: LightbulbIcon,
						id: "latest",
						label: "Latest",
					},
					{
						href: "/insights/investigations",
						icon: MagnifyingGlassIcon,
						id: "investigations",
						label: "Investigations",
					},
					{
						href: "/insights/recommendations",
						icon: WrenchIcon,
						id: "recommendations",
						label: "Recommendations",
					},
				]}
				variant="tabs"
			/>

			{hasNoWebsites ? (
				<EmptyState
					action={{
						label: "Go to websites",
						onClick: () => {
							window.location.href = "/websites";
						},
					}}
					description="Add a website to start receiving insights across your organization."
					icon={<GlobeIcon weight="duotone" />}
					title="No websites yet"
					variant="minimal"
				/>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					{children}
				</div>
			)}
		</div>
	);
}
