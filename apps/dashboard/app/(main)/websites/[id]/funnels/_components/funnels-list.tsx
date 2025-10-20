'use client';

import { FunnelIcon } from '@phosphor-icons/react';
import { EmptyState } from '@/components/empty-state';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Funnel } from '@/hooks/use-funnels';
import { FunnelCard } from './funnel-card';

interface FunnelsListProps {
	funnels: Funnel[];
	isLoading: boolean;
	expandedFunnelId: string | null;
	onToggleFunnel: (funnelId: string) => void;
	onEditFunnel: (funnel: Funnel) => void;
	onDeleteFunnel: (funnelId: string) => void;
	onCreateFunnel: () => void;
	children?: (funnel: Funnel) => React.ReactNode;
}

export function FunnelsList({
	funnels,
	isLoading,
	expandedFunnelId,
	onToggleFunnel,
	onEditFunnel,
	onDeleteFunnel,
	onCreateFunnel,
	children,
}: FunnelsListProps) {
	if (isLoading) {
		return (
			<div className="space-y-4">
				{new Array(3).fill(null).map((_, index) => (
					<Card className="rounded" key={index.toString()}>
						<CardHeader className="pb-4">
							<div className="flex items-center justify-between">
								<div className="flex-1">
									<div className="mb-2 flex items-center gap-3">
										<Skeleton className="h-6 w-48" />
										<Skeleton className="h-4 w-4" />
									</div>
									<div className="flex items-center gap-4">
										<Skeleton className="h-5 w-16" />
										<Skeleton className="h-4 w-20" />
									</div>
								</div>
								<Skeleton className="h-8 w-8" />
							</div>
							<div className="mt-4">
								<Skeleton className="mb-3 h-4 w-24" />
								<div className="flex gap-2">
									<Skeleton className="h-8 w-24" />
									<Skeleton className="h-4 w-4" />
									<Skeleton className="h-8 w-28" />
									<Skeleton className="h-4 w-4" />
									<Skeleton className="h-8 w-32" />
								</div>
							</div>
						</CardHeader>
					</Card>
				))}
			</div>
		);
	}

	if (funnels.length === 0) {
		return (
			<EmptyState
				action={{
					label: 'Create Your First Funnel',
					onClick: onCreateFunnel,
				}}
				description="Create your first funnel to start tracking user conversion journeys and identify optimization opportunities in your user flow."
				icon={
					<FunnelIcon
						className="h-16 w-16 text-primary"
						size={16}
						weight="duotone"
					/>
				}
				title="No funnels yet"
				variant="default"
			/>
		);
	}

	return (
		<div className="space-y-4">
			{funnels.map((funnel) => (
				<FunnelCard
					funnel={funnel}
					isExpanded={expandedFunnelId === funnel.id}
					key={funnel.id}
					onDelete={onDeleteFunnel}
					onEdit={onEditFunnel}
					onToggle={onToggleFunnel}
				>
					{children?.(funnel)}
				</FunnelCard>
			))}
		</div>
	);
}
