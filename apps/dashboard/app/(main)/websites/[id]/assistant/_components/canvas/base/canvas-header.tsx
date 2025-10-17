'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

interface CanvasHeaderProps {
	title: string;
	description?: string;
	isLoading?: boolean;
	actions?: React.ReactNode;
	className?: string;
}

export function CanvasHeader({
	title,
	description,
	isLoading = false,
	actions,
	className,
}: CanvasHeaderProps) {
	if (isLoading) {
		return (
			<div
				className={cn(
					'-my-4 -mx-6 mb-4 flex h-22 items-center justify-between border-border border-b px-6',
					className
				)}
			>
				<div className="space-y-2">
					<Skeleton height="1.125rem" width="8rem" />
					{description && <Skeleton height="0.875rem" width="12rem" />}
				</div>
				{actions && (
					<div className="flex gap-2">
						<Skeleton height="2rem" width="3rem" />
						<Skeleton height="2rem" width="3rem" />
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			className={cn(
				'-my-4 -mx-6 mb-4 flex h-22 items-center justify-between border-border border-b px-6',
				className
			)}
		>
			<div>
				<h2 className="font-semibold text-foreground text-lg leading-[23px]">
					{title}
				</h2>
				{description && (
					<p className="mt-1 text-muted-foreground text-sm">{description}</p>
				)}
			</div>
		</div>
	);
}
