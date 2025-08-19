import {
	CheckCircleIcon,
	InfoIcon,
	LightbulbIcon,
	WarningCircleIcon,
	XCircleIcon,
} from '@phosphor-icons/react/ssr';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const calloutVariants = cva(
	'group relative my-4 w-full rounded border backdrop-blur-sm transition-all duration-300',
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
		<div
			className={cn(calloutVariants({ type }), className)}
			role="alert"
			{...props}
		>
			<div className="flex items-start gap-4 p-4">
				<Icon
					className={cn(iconVariants({ type }), 'mt-0.5')}
					weight="duotone"
				/>
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

			{/* Sci-fi corners */}
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
					<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground/20" />
					<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground/20" />
				</div>
				<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
					<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground/20" />
					<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground/20" />
				</div>
				<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
					<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground/20" />
					<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground/20" />
				</div>
				<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
					<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground/20" />
					<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground/20" />
				</div>
			</div>
		</div>
	);
}

export { Callout };
