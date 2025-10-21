import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

interface CornerCardProps {
	children: ReactNode;
	className?: string;
	animated?: boolean;
	cornerSize?: 'sm' | 'md' | 'lg';
	id?: string;
	onClick?: () => void;
	href?: string;
	target?: string;
	rel?: string;
}

export function CornerCard({
	children,
	className,
	animated = true,
	cornerSize = 'md',
	id,
	onClick,
	href,
	target,
	rel,
}: CornerCardProps) {
	const sizeClasses = {
		sm: 'h-1 w-1',
		md: 'h-2 w-2',
		lg: 'h-3 w-3',
	};

	const lineSizeClasses = {
		sm: {
			horizontal: 'h-0.5 w-1',
			vertical: 'h-1 w-0.5',
		},
		md: {
			horizontal: 'h-0.5 w-1.5',
			vertical: 'h-2 w-0.5',
		},
		lg: {
			horizontal: 'h-0.5 w-2',
			vertical: 'h-3 w-0.5',
		},
	};

	const animationClass = animated
		? 'group-hover:animate-[cornerGlitch_0.6s_ease-in-out]'
		: '';

	const corners = (
		<div className="pointer-events-none absolute inset-0">
			{/* Top Left */}
			<div
				className={cn(
					'absolute top-0 left-0',
					sizeClasses[cornerSize],
					animationClass
				)}
			>
				<div
					className={cn(
						'absolute top-0 left-0.5 origin-left bg-foreground',
						lineSizeClasses[cornerSize].horizontal
					)}
				/>
				<div
					className={cn(
						'absolute top-0 left-0 origin-top bg-foreground',
						lineSizeClasses[cornerSize].vertical
					)}
				/>
			</div>

			{/* Top Right */}
			<div
				className={cn(
					'-scale-x-[1] absolute top-0 right-0',
					sizeClasses[cornerSize],
					animationClass
				)}
			>
				<div
					className={cn(
						'absolute top-0 left-0.5 origin-left bg-foreground',
						lineSizeClasses[cornerSize].horizontal
					)}
				/>
				<div
					className={cn(
						'absolute top-0 left-0 origin-top bg-foreground',
						lineSizeClasses[cornerSize].vertical
					)}
				/>
			</div>

			{/* Bottom Left */}
			<div
				className={cn(
					'-scale-y-[1] absolute bottom-0 left-0',
					sizeClasses[cornerSize],
					animationClass
				)}
			>
				<div
					className={cn(
						'absolute top-0 left-0.5 origin-left bg-foreground',
						lineSizeClasses[cornerSize].horizontal
					)}
				/>
				<div
					className={cn(
						'absolute top-0 left-0 origin-top bg-foreground',
						lineSizeClasses[cornerSize].vertical
					)}
				/>
			</div>

			{/* Bottom Right */}
			<div
				className={cn(
					'-scale-[1] absolute right-0 bottom-0',
					sizeClasses[cornerSize],
					animationClass
				)}
			>
				<div
					className={cn(
						'absolute top-0 left-0.5 origin-left bg-foreground',
						lineSizeClasses[cornerSize].horizontal
					)}
				/>
				<div
					className={cn(
						'absolute top-0 left-0 origin-top bg-foreground',
						lineSizeClasses[cornerSize].vertical
					)}
				/>
			</div>
		</div>
	);

	const cardContent = (
		<div className="relative">
			<Card
				className={cn(
					'group overflow-hidden',
					'border-border/50 hover:border-primary/20',
					'bg-card',
					className
				)}
				id={id}
				onClick={onClick}
			>
				{corners}
				<div className="relative z-10">
					{children}
				</div>
			</Card>
		</div>
	);

	// If href is provided, wrap in a link
	if (href) {
		return (
			<a
				href={href}
				target={target}
				rel={rel}
				className="group relative block cursor-pointer"
			>
				<Card
					className={cn(
						'group overflow-hidden',
						'border-border/50 hover:border-primary/20',
						'bg-card',
						className
					)}
					id={id}
				>
					{corners}
					<div className="relative z-10">
						{children}
					</div>
				</Card>
			</a>
		);
	}

	return cardContent;
}
