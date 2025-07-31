import { ExternalLink, HelpCircle } from 'lucide-react';
import type React from 'react';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PERFORMANCE_THRESHOLDS } from './analytics-helpers';

// Consistent border radius values
export const BORDER_RADIUS = {
	sm: 'rounded', // Small components like buttons
	md: 'rounded', // Cards, panels
	lg: 'rounded', // Large containers
	card: 'rounded', // Standard card component
	container: 'rounded', // Containers that hold cards
};

interface MetricToggleProps {
	label: string;
	checked: boolean;
	onChange: () => void;
	color: string;
}

export const MetricToggle: React.FC<MetricToggleProps> = ({
	label,
	checked,
	onChange,
	color,
}) => {
	// Get proper hex values for the colors
	const getColorMap = (colorName: string) => {
		const colorMap: Record<string, string> = {
			'blue-500': '#3b82f6',
			'green-500': '#22c55e',
			'emerald-500': '#10b981',
			'yellow-500': '#eab308',
			'red-500': '#ef4444',
			'purple-500': '#a855f7',
			'pink-500': '#ec4899',
			'indigo-500': '#6366f1',
			'orange-500': '#f97316',
			'sky-500': '#0ea5e9',
		};

		return colorMap[colorName] || '#3b82f6'; // Default to blue if color not found
	};

	const colorHex = getColorMap(color);

	return (
		<button
			aria-pressed={checked}
			className={cn(
				'group flex cursor-pointer items-center gap-2.5 rounded border px-3.5 py-2 transition-all duration-200',
				checked
					? 'border-primary/20 bg-primary/5 shadow-sm hover:border-primary/30 hover:bg-primary/10'
					: 'border-border/50 bg-transparent hover:border-border hover:bg-muted/30'
			)}
			onClick={onChange}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onChange();
				}
			}}
			tabIndex={0}
			type="button"
		>
			<div
				className={cn(
					'h-2.5 w-2.5 rounded-full transition-all duration-200',
					checked
						? 'scale-100 shadow-sm'
						: 'scale-75 opacity-50 group-hover:scale-90 group-hover:opacity-75'
				)}
				style={{
					backgroundColor: colorHex,
					boxShadow: checked ? `0 0 0 2px ${colorHex}20` : 'none',
				}}
			/>
			<span
				className={cn(
					'font-medium text-sm transition-colors duration-200',
					checked
						? 'text-primary'
						: 'text-muted-foreground group-hover:text-foreground'
				)}
			>
				{label}
			</span>
		</button>
	);
};

interface MetricTogglesProps {
	metrics: Record<string, boolean>;
	onToggle: (metric: string) => void;
	colors: Record<string, string>;
	labels?: Record<string, string>;
}

export const MetricToggles: React.FC<MetricTogglesProps> = ({
	metrics,
	onToggle,
	colors,
	labels = {},
}) => {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{Object.keys(metrics).map((metric) => (
				<MetricToggle
					checked={metrics[metric]}
					color={colors[metric] || 'blue-500'}
					key={metric}
					label={labels[metric] || metric}
					onChange={() => onToggle(metric)}
				/>
			))}
		</div>
	);
};

interface ExternalLinkButtonProps {
	href: string;
	label: string;
	title?: string;
	className?: string;
	showTooltip?: boolean;
}

export const ExternalLinkButton: React.FC<ExternalLinkButtonProps> = ({
	href,
	label,
	title,
	className = 'font-medium hover:text-primary hover:underline truncate max-w-[250px] flex items-center gap-1',
	showTooltip = true,
}) => {
	const content = (
		<a
			className={className}
			href={href}
			rel="noopener noreferrer"
			target="_blank"
		>
			{label}
			<ExternalLink className="h-3 w-3 opacity-70" />
		</a>
	);

	if (!showTooltip) {
		return content;
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{content}</TooltipTrigger>
				<TooltipContent className="border bg-background p-2 text-foreground text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
					{title || href}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

export const EmptyState: React.FC<{
	icon: React.ReactNode;
	title: string;
	description: string;
	action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
	<div className="flex h-64 items-center justify-center">
		<div className="text-center text-muted-foreground">
			<div className="mx-auto mb-2 opacity-30">{icon}</div>
			<p className="mb-1 font-medium text-base">{title}</p>
			<p className="mb-3">{description}</p>
			{action}
		</div>
	</div>
);

// Tooltip for performance metrics
export const MetricTooltip = ({
	metricKey,
	label,
	children,
}: {
	metricKey: keyof typeof PERFORMANCE_THRESHOLDS;
	label?: string;
	children: React.ReactNode;
}) => {
	const threshold = PERFORMANCE_THRESHOLDS[metricKey];
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="relative w-full">
						{children}
						<HelpCircle className="absolute top-2 right-2 h-3 w-3 text-muted-foreground/50" />
					</div>
				</TooltipTrigger>
				<TooltipContent className="max-w-[300px] space-y-2 border bg-background p-3 text-foreground shadow-lg">
					<div className="font-medium text-xs">
						{label || String(metricKey).replace(/_/g, ' ')}
					</div>
					<div className="space-y-1 text-xs">
						<div className="flex items-center">
							<div className="mr-1.5 h-2 w-2 rounded-full bg-green-500" />
							<span>
								Good: &lt; {threshold.good}
								{threshold.unit}
							</span>
						</div>
						<div className="flex items-center">
							<div className="mr-1.5 h-2 w-2 rounded-full bg-yellow-500" />
							<span>
								Needs improvement: {threshold.good}
								{threshold.unit} - {threshold.average}
								{threshold.unit}
							</span>
						</div>
						<div className="flex items-center">
							<div className="mr-1.5 h-2 w-2 rounded-full bg-red-500" />
							<span>
								Poor: &gt; {threshold.average}
								{threshold.unit}
							</span>
						</div>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
