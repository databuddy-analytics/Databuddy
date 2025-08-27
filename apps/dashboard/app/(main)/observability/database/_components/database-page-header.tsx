'use client';

import { ArrowClockwiseIcon, PlusIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DatabasePageHeaderProps {
	title: string;
	description?: string;
	icon: ReactNode;

	isLoading?: boolean;
	isRefreshing?: boolean;

	hasError?: boolean;
	errorMessage?: string;

	onRefresh?: () => void;
	onCreateAction?: () => void;
	createActionLabel?: string;

	subtitle?: string | ReactNode;

	additionalActions?: ReactNode;
}

export function DatabasePageHeader({
	title,
	description,
	icon,
	isLoading = false,
	isRefreshing = false,
	hasError = false,
	errorMessage,
	onRefresh,
	onCreateAction,
	createActionLabel = 'Create',
	subtitle,
	additionalActions,
}: DatabasePageHeaderProps) {
	const renderSubtitle = () => {
		if (isLoading) {
			return <Skeleton className="h-4 w-48" />;
		}

		if (subtitle) {
			return typeof subtitle === 'string' ? (
				<p className="text-muted-foreground text-sm sm:text-base">{subtitle}</p>
			) : (
				subtitle
			);
		}

		if (description) {
			return (
				<p className="text-muted-foreground text-sm sm:text-base">
					{description}
				</p>
			);
		}

		return null;
	};

	return (
		<div className="space-y-6">
			<div className="border-b pb-6">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<div className="rounded border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-3">
								{icon}
							</div>
							<div>
								<h1 className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text font-bold text-2xl text-transparent tracking-tight sm:text-3xl">
									{title}
								</h1>
								{renderSubtitle()}
							</div>
						</div>
					</div>
					{/* Sidebar gets hidden when the screen is smaller than md */}
					<div className="flex flex-row items-stretch gap-3 md:flex-col lg:flex-row">
						{onRefresh && (
							<Button
								className="gap-2 border-border/50 transition-all duration-200 hover:border-primary/50 hover:bg-primary/5"
								disabled={isRefreshing}
								onClick={onRefresh}
								variant="outline"
							>
								<ArrowClockwiseIcon
									className={isRefreshing ? 'animate-spin' : ''}
								/>
								Refresh Data
							</Button>
						)}
						{onCreateAction && (
							<Button
								className="gap-2 bg-gradient-to-r from-primary to-primary/90 shadow-lg transition-all duration-200 hover:from-primary/90 hover:to-primary hover:shadow-xl"
								onClick={onCreateAction}
							>
								<PlusIcon />
								{createActionLabel}
							</Button>
						)}
						{additionalActions}
					</div>
				</div>
			</div>

			{hasError && (
				<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex flex-col items-center space-y-3 text-center">
							<div className="rounded-full border border-destructive/20 bg-destructive/10 p-3">
								{icon}
							</div>
							<div>
								<h4 className="font-semibold text-destructive">
									Error loading {title.toLowerCase()}
								</h4>
								<p className="mt-1 text-destructive/80 text-sm">
									{errorMessage ||
										`There was an issue loading your ${title.toLowerCase()}. Please try refreshing the page.`}
								</p>
							</div>
							{onRefresh && (
								<Button
									className="gap-2 rounded"
									onClick={onRefresh}
									size="sm"
									variant="outline"
								>
									<ArrowClockwiseIcon className="h-4 w-4" />
									Retry
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
