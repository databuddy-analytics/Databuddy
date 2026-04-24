"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { use, useMemo } from "react";
import { List } from "@/components/ui/composables/list";
import { listQueryOutcome } from "@/lib/list-query-outcome";
import { orpc } from "@/lib/orpc";
import { WebsitePageHeader } from "../../_components/website-page-header";
import {
	AnomalyItem,
	type AnomalyItemData,
	AnomalyItemSkeleton,
} from "./anomaly-item";

interface AnomaliesPageContentProps {
	params: Promise<{ id: string }>;
}

function AnomaliesListSkeleton() {
	return (
		<List className="rounded bg-card">
			{[1, 2, 3].map((i) => (
				<AnomalyItemSkeleton key={i} />
			))}
		</List>
	);
}

export function AnomaliesPageContent({ params }: AnomaliesPageContentProps) {
	const { id: websiteId } = use(params);

	const {
		data: anomalies,
		isLoading,
		isPending,
		isError,
		isSuccess,
		isFetching,
		refetch,
	} = useQuery({
		...orpc.anomalies.detect.queryOptions({
			input: { websiteId },
		}),
		refetchInterval: 300_000,
	});

	const items = (anomalies ?? []) as AnomalyItemData[];

	const outcome = useMemo(
		() =>
			listQueryOutcome<AnomalyItemData>({
				data: items,
				isError,
				isPending,
				isSuccess,
			}),
		[items, isError, isPending, isSuccess]
	);

	const criticalCount = items.filter((a) => a.severity === "critical").length;

	const subtitle = useMemo(() => {
		if (isLoading) {
			return;
		}
		if (items.length === 0) {
			return "No anomalies detected";
		}
		const parts: string[] = [];
		parts.push(
			`${items.length} anomal${items.length === 1 ? "y" : "ies"} detected`
		);
		if (criticalCount > 0) {
			parts.push(`${criticalCount} critical`);
		}
		return parts.join(" · ");
	}, [isLoading, items.length, criticalCount]);

	return (
		<div className="relative flex h-full flex-col">
			<WebsitePageHeader
				description="Detects unusual patterns in event data"
				hasError={isError}
				icon={
					<WarningIcon
						className="size-6 text-accent-foreground"
						weight="duotone"
					/>
				}
				isLoading={isLoading}
				isRefreshing={isFetching}
				onRefreshAction={() => refetch()}
				subtitle={subtitle}
				title="Anomalies"
				websiteId={websiteId}
			/>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
				<List.Content
					emptyProps={{
						description:
							"No unusual patterns in the last hour compared to your 7-day baseline. Pageviews, errors, and custom events are checked automatically.",
						icon: <CheckCircleIcon weight="duotone" />,
						title: "All clear",
					}}
					errorProps={{
						action: { label: "Retry", onClick: () => refetch() },
						description: "Something went wrong while scanning for anomalies.",
						icon: <WarningIcon weight="duotone" />,
						title: "Failed to load anomalies",
					}}
					loading={<AnomaliesListSkeleton />}
					outcome={outcome}
				>
					{(list) => (
						<List className="rounded bg-card">
							{list.map((anomaly, idx) => (
								<AnomalyItem
									anomaly={anomaly}
									key={`${anomaly.metric}-${anomaly.eventName ?? ""}-${idx}`}
								/>
							))}
						</List>
					)}
				</List.Content>
			</div>
		</div>
	);
}
