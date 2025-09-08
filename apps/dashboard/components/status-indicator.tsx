'use client';

import { cn } from '@/lib/utils';

type Status = 'live' | 'deprecated' | 'offline';

interface StatusIndicatorProps {
	status: Status;
	className?: string;
}

const statusConfig = {
	live: {
		color: 'bg-green-500',
		label: 'Live',
		animation: 'animate-pulse',
	},
	deprecated: {
		color: 'bg-yellow-500',
		label: 'Deprecated',
		animation: 'animate-pulse',
	},
	offline: {
		color: 'bg-red-500',
		label: 'Offline',
		animation: '',
	},
} as const;

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
	const config = statusConfig[status];

	return (
		<div className={cn('flex items-center gap-1 select-none', className)}>
			<div
				className={cn(
					'h-2 w-2 rounded-full',
					config.color,
					config.animation
				)}
			/>
			<span className="text-xs text-muted-foreground">{config.label}</span>
		</div>
	);
}
