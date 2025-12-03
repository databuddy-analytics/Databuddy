"use client";

import { FunnelIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
import type { FunnelAnalyticsData } from "@/types/funnels";
import { FunnelItem, type FunnelItemData } from "./funnel-item";

interface FunnelsListProps {
	funnels: FunnelItemData[];
	expandedFunnelId: string | null;
	analyticsMap?: Map<string, FunnelAnalyticsData | null>;
	loadingAnalyticsIds?: Set<string>;
	onToggleFunnel: (funnelId: string) => void;
	onEditFunnel: (funnel: FunnelItemData) => void;
	onDeleteFunnel: (funnelId: string) => void;
	onCreateFunnel: () => void;
	children?: (funnel: FunnelItemData) => React.ReactNode;
}

export function FunnelsList({
	funnels,
	expandedFunnelId,
	analyticsMap,
	loadingAnalyticsIds,
	onToggleFunnel,
	onEditFunnel,
	onDeleteFunnel,
	onCreateFunnel,
	children,
}: FunnelsListProps) {
	if (funnels.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-16">
				<EmptyState
					action={{
						label: "Create Your First Funnel",
						onClick: onCreateFunnel,
					}}
					description="Create your first funnel to start tracking user conversion journeys and identify optimization opportunities in your user flow."
					icon={<FunnelIcon weight="duotone" />}
					title="No funnels yet"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div>
			{funnels.map((funnel, index) => (
				<FunnelItem
					analytics={analyticsMap?.get(funnel.id)}
					funnel={funnel}
					isExpanded={expandedFunnelId === funnel.id}
					isLoadingAnalytics={loadingAnalyticsIds?.has(funnel.id)}
					key={funnel.id}
					onDelete={onDeleteFunnel}
					onEdit={onEditFunnel}
					onToggle={onToggleFunnel}
				>
					{children?.(funnel)}
				</FunnelItem>
			))}
		</div>
	);
}
