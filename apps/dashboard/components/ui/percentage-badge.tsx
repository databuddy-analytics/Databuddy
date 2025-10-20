import { cn } from '@/lib/utils';

interface PercentageBadgeProps {
	percentage: number;
	className?: string;
}

export function PercentageBadge({
	percentage,
	className,
}: PercentageBadgeProps) {
	const getColorClass = (pct: number) => {
		if (pct >= 50) {
			return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
		}
		if (pct >= 25) {
			return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
		}
		if (pct >= 10) {
			return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
		}
		return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
	};

	return (
		<span
			className={cn(
				'inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs',
				getColorClass(percentage),
				className
			)}
		>
			{percentage}%
		</span>
	);
}
