'use client';

import { Skeleton as UISkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonProps {
	className?: string;
	width?: string | number;
	height?: string | number;
	rounded?: boolean;
}

export function Skeleton({
	className,
	width = '100%',
	height = '1rem',
	rounded = false,
}: SkeletonProps) {
	return (
		<UISkeleton
			className={cn('w-full', rounded ? 'rounded' : 'rounded-none', className)}
			style={{ width, height }}
		/>
	);
}

export function SkeletonLine({
	width = '100%',
	className,
}: {
	width?: string;
	className?: string;
}) {
	return (
		<UISkeleton
			className={cn('mb-2 h-3 w-full rounded-none', className)}
			style={{ width }}
		/>
	);
}

export function SkeletonCard({
	className,
	children,
}: {
	className?: string;
	children?: React.ReactNode;
}) {
	return (
		<div
			className={cn('rounded-none border border-border bg-card p-3', className)}
		>
			{children}
		</div>
	);
}

export function SkeletonChart({
	height = '20rem',
	className,
}: {
	height?: string | number;
	className?: string;
}) {
	return (
		<div className={cn('space-y-4', className)}>
			{/* Chart Header Skeleton */}
			<div className="flex items-center justify-between">
				<UISkeleton className="h-[1.125rem] w-32 rounded-none" />
				<div className="flex items-center gap-4">
					<div className="flex items-center gap-2">
						<UISkeleton className="h-2 w-2 rounded-none" />
						<UISkeleton className="h-3 w-12 rounded-none" />
					</div>
					<div className="flex items-center gap-2">
						<UISkeleton className="h-2 w-2 rounded-none" />
						<UISkeleton className="h-3 w-12 rounded-none" />
					</div>
				</div>
			</div>

			{/* Chart Area Skeleton */}
			<UISkeleton
				className="w-full rounded-none opacity-20"
				style={{ height }}
			/>
		</div>
	);
}

export function SkeletonGrid({
	columns = 2,
	className,
}: {
	columns?: 1 | 2 | 3 | 4;
	className?: string;
}) {
	const gridCols = {
		1: 'grid-cols-1',
		2: 'grid-cols-2',
		3: 'grid-cols-3',
		4: 'grid-cols-4',
	};

	const skeletonItems = Array.from({ length: columns * 2 }, (_, i) => {
		const uniqueId = `skeleton-card-${columns}-${i}`;
		return (
			<SkeletonCard key={uniqueId}>
				<SkeletonLine width="5rem" />
				<UISkeleton className="mb-1 h-5 w-16 rounded-none" />
				<SkeletonLine width="6rem" />
			</SkeletonCard>
		);
	});

	return (
		<div className={cn('grid gap-3', gridCols[columns], className)}>
			{skeletonItems}
		</div>
	);
}
