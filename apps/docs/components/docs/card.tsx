import Link from 'next/link';
import type * as React from 'react';
import { SciFiCard } from '@/components/scifi-card';
import { cn } from '@/lib/utils';

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
		<SciFiCard
			className={cn(
				'group h-full rounded-none border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:bg-card/70',
				href && 'cursor-pointer',
				className
			)}
			opacity="reduced"
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
		</SciFiCard>
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
