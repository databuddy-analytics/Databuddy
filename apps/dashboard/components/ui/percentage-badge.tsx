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
			return 'bg-green-100 border border-green-800/50 green-angled-rectangle-gradient text-green-800 dark:bg-green-900/30 dark:text-green-400';
		}
		if (pct >= 25) {
			return 'bg-blue-100 border border-blue-800/50 blue-angled-rectangle-gradient text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
		}
		if (pct >= 10) {
			return 'bg-amber-100 border border-amber-800/40 amber-angled-rectangle-gradient text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
		}
		return 'bg-secondary border border-accent-foreground/30 badge-angled-rectangle-gradient text-accent-foreground';
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
