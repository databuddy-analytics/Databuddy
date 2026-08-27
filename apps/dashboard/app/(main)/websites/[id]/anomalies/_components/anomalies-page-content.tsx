"use client";

import {
	ArrowClockwiseIcon,
	CheckCircleIcon,
	WarningIcon,
} from "@databuddy/ui/icons";
import { TopBar } from "@/components/layout/top-bar";
import { List } from "@/components/ui/composables/list";
import { listQueryOutcome } from "@/lib/list-query-outcome";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { use, useMemo } from "react";
import {
	AnomalyItem,
	type AnomalyItemData,
	AnomalyItemSkeleton,
} from "./anomaly-item";
import { Button } from "@databuddy/ui";

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

	return (
		<div className="relative flex h-full flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Anomalies</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh"
					disabled={isFetching}
					onClick={() => refetch()}
					size="sm"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						className={cn("size-4 shrink-0", isFetching && "animate-spin")}
					/>
				</Button>
			</TopBar.Actions>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
				<List.Content
					emptyProps={{
						description:
							"No unusual patterns in the last hour compared to your 7-day baseline. Pageviews, errors, and custom events are checked when you open this page or press refresh.",
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
