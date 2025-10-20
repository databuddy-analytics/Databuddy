'use client';

import { PlusIcon } from '@phosphor-icons/react';
import { memo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface EmptyStateAction {
	label: string;
	onClick: () => void;
	variant?: 'default' | 'outline' | 'secondary';
}

export interface EmptyStateProps {
	/** Main icon to display */
	icon: ReactNode;
	/** Main heading */
	title: string;
	/** Description text */
	description: string | ReactNode;
	/** Primary action button */
	action?: EmptyStateAction;
	/** Secondary action button */
	secondaryAction?: EmptyStateAction;
	/** Custom styling variants */
	variant?: 'default' | 'simple' | 'minimal';
	/** Custom className */
	className?: string;
	/** Whether to show the plus badge on the icon */
	showPlusBadge?: boolean;
	/** Custom padding */
	padding?: 'sm' | 'md' | 'lg';
	/** Custom role for accessibility (defaults to 'region') */
	role?: 'region' | 'complementary' | 'main';
	/** Custom aria-label for screen readers */
	'aria-label'?: string;
	/** Whether this is the main content area */
	isMainContent?: boolean;
}

export const EmptyState = memo(function EmptyState({
	icon,
	title,
	description,
	action,
	secondaryAction,
	variant = 'default',
	className,
	showPlusBadge = true,
	padding = 'lg',
	role = 'region',
	'aria-label': ariaLabel,
	isMainContent = false,
}: EmptyStateProps) {
	const getPadding = () => {
		switch (padding) {
			case 'sm':
				return 'px-6 py-12';
			case 'md':
				return 'px-8 py-14';
			case 'lg':
				return 'px-8 py-16';
			default:
				return 'px-8 py-16';
		}
	};

	const renderIcon = () => {
		if (variant === 'simple' || variant === 'minimal') {
			return (
				<div
					aria-hidden="true"
					className="mb-4 rounded-full border border-muted bg-muted/10 p-6"
					role="img"
				>
					{icon}
				</div>
			);
		}

		return (
			<div className="group relative mb-8">
				<div
					aria-hidden="true"
					className="rounded-full border-2 border-primary/10 bg-primary/5 p-6"
					role="img"
				>
					{icon}
				</div>
				{showPlusBadge && (
					<button
						aria-label="Create new item"
						className="-top-2 -right-2 absolute cursor-pointer select-none rounded-full border-2 border-primary/10 bg-background p-2"
						onClick={(e) => {
							e.stopPropagation();
							action?.onClick();
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								action?.onClick();
							}
						}}
						tabIndex={0}
						type="button"
					>
						<PlusIcon className="h-6 w-6 text-primary" size={16} />
					</button>
				)}
			</div>
		);
	};

	const renderCard = () => {
		const cardClasses = cn(
			variant === 'default' &&
				'rounded-xl border-2 border-dashed bg-gradient-to-br from-background to-muted/10',
			variant === 'simple' && 'rounded border-dashed bg-muted/10',
			variant === 'minimal' && 'rounded border-none bg-transparent shadow-none',
			'safe-area-inset-4 sm:safe-area-inset-6 lg:safe-area-inset-8',
			className
		);

		const contentClasses = cn(
			'flex flex-col items-center justify-center text-center',
			getPadding(),
			'px-6 sm:px-8 lg:px-12'
		);

		return (
			<Card
				aria-label={ariaLabel || `${title} - Empty State`}
				className={cardClasses}
				role={isMainContent ? 'main' : role}
			>
				<CardContent className={contentClasses}>
					{renderIcon()}
					<div
						className={cn(
							'space-y-4',
							variant === 'minimal' && 'max-w-sm',
							variant !== 'minimal' && 'max-w-md lg:max-w-lg'
						)}
					>
						{isMainContent ? (
							<h1
								className={cn(
									'font-semibold text-foreground',
									variant === 'minimal' ? 'text-lg' : 'text-2xl lg:text-3xl'
								)}
							>
								{title}
							</h1>
						) : (
							<h2
								className={cn(
									'font-semibold text-foreground',
									variant === 'minimal' ? 'text-lg' : 'text-2xl lg:text-3xl'
								)}
							>
								{title}
							</h2>
						)}
						<div
							className={cn(
								'text-muted-foreground leading-relaxed',
								variant === 'minimal' ? 'text-sm' : 'text-base lg:text-lg'
							)}
						>
							{description}
						</div>
						{(action || secondaryAction) && (
							<div
								className={cn(
									'flex flex-col items-stretch justify-center gap-3 pt-4',
									'sm:flex-row sm:items-center'
								)}
							>
								{action && (
									<Button
										className={cn(
											variant === 'default' &&
												'group relative min-h-[44px] cursor-pointer touch-manipulation select-none gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-primary to-primary/90 px-8 py-4 font-medium text-base transition-all duration-300 hover:from-primary/90 hover:to-primary hover:shadow-lg focus-visible:shadow-md focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none sm:min-h-[40px]',
											variant === 'simple' &&
												'min-h-[44px] cursor-pointer touch-manipulation select-none gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none sm:min-h-[40px]',
											variant === 'minimal' &&
												'min-h-[44px] cursor-pointer touch-manipulation select-none gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none sm:min-h-[40px]'
										)}
										onClick={action.onClick}
										size="lg"
										type="button"
										variant={action.variant || 'default'}
									>
										{variant === 'default' && (
											<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-[100%] motion-reduce:transform-none" />
										)}
										{variant === 'default' && (
											<PlusIcon
												className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:rotate-90 motion-reduce:transform-none"
												size={20}
											/>
										)}
										<span
											className={cn(variant === 'default' && 'relative z-10')}
										>
											{action.label}
										</span>
									</Button>
								)}
								{secondaryAction && (
									<Button
										className={cn(
											'min-h-[44px] touch-manipulation focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none sm:min-h-[40px]'
										)}
										onClick={secondaryAction.onClick}
										size="lg"
										type="button"
										variant={secondaryAction.variant || 'outline'}
									>
										{secondaryAction.label}
									</Button>
								)}
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		);
	};

	return renderCard();
});

EmptyState.displayName = 'EmptyState';

export function FeatureEmptyState({
	icon,
	title,
	description,
	actionLabel,
	onAction,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	actionLabel: string;
	onAction: () => void;
}) {
	return (
		<EmptyState
			action={{ label: actionLabel, onClick: onAction }}
			description={description}
			icon={icon}
			title={title}
			variant="default"
		/>
	);
}
