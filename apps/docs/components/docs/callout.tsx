import {
	CheckCircleIcon,
	InfoIcon,
	LightbulbIcon,
	WarningCircleIcon,
	XCircleIcon,
} from '@phosphor-icons/react/ssr';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { SciFiCard } from '@/components/scifi-card';
import { cn } from '@/lib/utils';

const calloutVariants = cva(
	'my-4 w-full rounded-none border backdrop-blur-sm transition-all duration-300',
	{
		variants: {
			type: {
				info: 'border-blue-200 bg-blue-50/80 hover:bg-blue-50/90 dark:border-blue-800/50 dark:bg-blue-950/20 dark:hover:bg-blue-950/30',
				success:
					'border-green-200 bg-green-50/80 hover:bg-green-50/90 dark:border-green-800/50 dark:bg-green-950/20 dark:hover:bg-green-950/30',
				warn: 'border-yellow-200 bg-yellow-50/80 hover:bg-yellow-50/90 dark:border-yellow-800/50 dark:bg-yellow-950/20 dark:hover:bg-yellow-950/30',
				error:
					'border-red-200 bg-red-50/80 hover:bg-red-50/90 dark:border-red-800/50 dark:bg-red-950/20 dark:hover:bg-red-950/30',
				tip: 'border-purple-200 bg-purple-50/80 hover:bg-purple-50/90 dark:border-purple-800/50 dark:bg-purple-950/20 dark:hover:bg-purple-950/30',
				note: 'border-border bg-card/50 hover:bg-card/70',
			},
		},
		defaultVariants: {
			type: 'info',
		},
	}
);

const iconVariants = cva('size-5 shrink-0', {
	variants: {
		type: {
			info: 'text-blue-500 dark:text-blue-400',
			success: 'text-green-500 dark:text-green-400',
			warn: 'text-yellow-500 dark:text-yellow-400',
			error: 'text-red-500 dark:text-red-400',
			tip: 'text-purple-500 dark:text-purple-400',
			note: 'text-muted-foreground',
		},
	},
	defaultVariants: {
		type: 'info',
	},
});

const iconMap = {
	info: InfoIcon,
	success: CheckCircleIcon,
	warn: WarningCircleIcon,
	error: XCircleIcon,
	tip: LightbulbIcon,
	note: InfoIcon,
};

interface CalloutProps
	extends React.ComponentProps<'div'>,
		VariantProps<typeof calloutVariants> {
	title?: string;
}

function Callout({
	className,
	type = 'info',
	title,
	children,
	...props
}: CalloutProps) {
	const Icon = iconMap[type as keyof typeof iconMap];

	return (
		<SciFiCard
			className={cn(calloutVariants({ type }), className)}
			opacity="reduced"
			role="alert"
			{...props}
		>
			<div className="flex items-center gap-2 pl-4">
				<div className="mt-0.5 flex-shrink-0">
					<Icon className={cn(iconVariants({ type }))} weight="duotone" />
				</div>
				<div className="min-w-0 flex-1 space-y-2">
					{title && (
						<div className="font-semibold text-foreground tracking-tight">
							{title}
						</div>
					)}
					<div className="text-foreground text-sm leading-relaxed [&_p]:text-foreground [&_p]:leading-relaxed">
						{children}
					</div>
				</div>
			</div>
		</SciFiCard>
	);
}

export { Callout };
