'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

interface CanvasSectionProps {
	title?: string;
	children: React.ReactNode;
	isLoading?: boolean;
	className?: string;
}

export function CanvasSection({
	title,
	children,
	isLoading = false,
	className,
}: CanvasSectionProps) {
	if (isLoading) {
		return (
			<div className={cn('mb-6', className)}>
				{title && <Skeleton className="mb-3" height="1rem" width="6rem" />}
				<div className="space-y-2">
					<Skeleton height="0.875rem" width="100%" />
					<Skeleton height="0.875rem" width="85%" />
					<Skeleton height="0.875rem" width="90%" />
				</div>
			</div>
		);
	}

	return (
		<div className={cn('mt-8 mb-4', className)}>
			{title && (
				<h3 className="mb-3 text-[12px] text-muted-foreground leading-normal">
					{title}
				</h3>
			)}
			<div className="font-normal text-[12px] text-foreground leading-[17px]">
				{children}
			</div>
		</div>
	);
}
