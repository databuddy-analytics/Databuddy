"use client";

import { List } from "@/components/ui/composables/list";
import type { FunnelAnalyticsData } from "@/types/funnels";
import { FunnelItem, type FunnelItemData } from "./funnel-item";

interface FunnelsListProps {
	analyticsMap?: Map<string, FunnelAnalyticsData | null>;
	children?: (funnel: FunnelItemData) => React.ReactNode;
	expandedFunnelId: string | null;
	funnels: FunnelItemData[];
	loadingAnalyticsIds?: Set<string>;
	onDeleteFunnel: (funnelId: string) => void;
	onEditFunnel: (funnel: FunnelItemData) => void;
	onToggleFunnel: (funnelId: string) => void;
}

export function FunnelsList({
	funnels,
	expandedFunnelId,
	analyticsMap,
	loadingAnalyticsIds,
	onToggleFunnel,
	onEditFunnel,
	onDeleteFunnel,
	children,
}: FunnelsListProps) {
	return (
		<List className="rounded bg-card">
			{funnels.map((funnel, index) => (
				<FunnelItem
					analytics={analyticsMap?.get(funnel.id)}
					funnel={funnel}
					isExpanded={expandedFunnelId === funnel.id}
					isLast={index === funnels.length - 1}
					isLoadingAnalytics={loadingAnalyticsIds?.has(funnel.id)}
					key={funnel.id}
					onDelete={onDeleteFunnel}
					onEdit={onEditFunnel}
					onToggle={onToggleFunnel}
				>
					{children?.(funnel)}
				</FunnelItem>
			))}
		</List>
	);
}
