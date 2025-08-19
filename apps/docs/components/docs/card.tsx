import Link from 'next/link';
import type * as React from 'react';

import { cn } from '@/lib/utils';

// Re-export the base card components
export {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

interface CardProps extends React.ComponentProps<'div'> {
	href?: string;
	title?: string;
	description?: string;
	icon?: React.ReactNode;
}

function Card({
	className,
	href,
	title,
	description,
	icon,
	children,
	...props
}: CardProps) {
	const content = (
		<div
			className={cn(
				'group relative h-full rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:bg-card/70',
				href && 'cursor-pointer',
				className
			)}
			{...props}
		>
			<div className="p-6">
				{icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
				{title && (
					<h3 className="mb-3 font-semibold text-foreground text-lg leading-6">
						{title}
					</h3>
				)}
				{description && (
					<p className="text-muted-foreground text-sm leading-relaxed">
						{description}
					</p>
				)}
				{children}
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

	if (href) {
		const isExternal = href.startsWith('http');

		if (isExternal) {
			return (
				<a
					className="block"
					href={href}
					rel="noopener noreferrer"
					target="_blank"
				>
					{content}
				</a>
			);
		}

		return (
			<Link className="block" href={href}>
				{content}
			</Link>
		);
	}

	return content;
}

interface CardsProps extends React.ComponentProps<'div'> {
	cols?: 1 | 2 | 3 | 4;
}

function Cards({ className, cols = 2, children, ...props }: CardsProps) {
	const gridCols = {
		1: 'grid-cols-1',
		2: 'grid-cols-1 md:grid-cols-2',
		3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
		4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
	};

	return (
		<div className={cn('grid gap-4', gridCols[cols], className)} {...props}>
			{children}
		</div>
	);
}

export { Card, Cards };
