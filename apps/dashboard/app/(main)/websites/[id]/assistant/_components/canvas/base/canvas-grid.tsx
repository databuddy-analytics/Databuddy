'use client';

import { cn } from '@/lib/utils';
import { SkeletonGrid } from './skeleton';

export type GridLayout = '1/1' | '2/2' | '2/3' | '4/4';

export interface GridItem {
	id: string;
	title: string;
	value: string;
	subtitle?: string;
	trend?: {
		value: string;
		isPositive?: boolean;
	};
}

interface CanvasGridProps {
	items: GridItem[];
	layout?: GridLayout;
	isLoading?: boolean;
	className?: string;
}

const layoutConfig = {
	'1/1': { columns: 1, maxItems: 1 },
	'2/2': { columns: 2, maxItems: 4 },
	'2/3': { columns: 2, maxItems: 3 },
	'4/4': { columns: 4, maxItems: 4 },
};

export function CanvasGrid({
	items,
	layout = '2/2',
	isLoading = false,
	className,
}: CanvasGridProps) {
	const config = layoutConfig[layout];
	const displayItems = items.slice(0, config.maxItems);

	if (isLoading) {
		return (
			<div className={cn('mb-6', className)}>
				<SkeletonGrid columns={config.columns as 1 | 2 | 3 | 4} />
			</div>
		);
	}

	return (
		<div className={cn('mb-6', className)}>
			<div
				className={cn('grid gap-3', {
					'grid-cols-1': config.columns === 1,
					'grid-cols-2': config.columns === 2,
					'grid-cols-4': config.columns === 4,
				})}
			>
				{displayItems.map((item, _index) => (
					<div className="border border-border bg-card p-3" key={item.id}>
						<div className="mb-1 text-[12px] text-muted-foreground">
							{item.title}
						</div>
						<div className="mb-1 font-normal text-[18px] text-foreground">
							{item.value}
						</div>
						{item.subtitle && (
							<div className="text-[10px] text-muted-foreground">
								{item.subtitle}
							</div>
						)}
						{item.trend && (
							<div
								className={cn(
									'mt-1 text-[10px]',
									item.trend.isPositive
										? 'text-green-600 dark:text-green-400'
										: 'text-red-600 dark:text-red-400'
								)}
							>
								{item.trend.value}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
