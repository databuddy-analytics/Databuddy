import { cn } from "@/lib/utils";

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
			return "bg-green-100 border border-green-800/50 green-angled-rectangle-gradient text-green-800 dark:bg-green-900/30 dark:text-green-400";
		}
		if (pct >= 25) {
			return "bg-brand-purple/10 border border-brand-purple/30 blue-angled-rectangle-gradient text-brand-purple dark:bg-brand-purple/20 dark:text-[#8B80BF]";
		}
		if (pct >= 10) {
			return "bg-amber-100 border border-amber-800/40 amber-angled-rectangle-gradient text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
		}
		return "bg-accent-brighter border border-accent-foreground/30 badge-angled-rectangle-gradient text-accent-foreground";
	};

	const safePercentage = percentage == null || Number.isNaN(percentage) ? 0 : percentage;

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs",
				getColorClass(safePercentage),
				className
			)}
		>
			{safePercentage.toFixed(1)}%
		</span>
	);
}
