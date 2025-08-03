'use client';

import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	PlusIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface WebsitePageHeaderProps {
	// Basic page info
	title: string;
	description?: string;
	icon: ReactNode;

	// Website context
	websiteId: string;
	websiteName?: string;

	// Loading states
	isLoading?: boolean;
	isRefreshing?: boolean;

	// Error handling
	hasError?: boolean;
	errorMessage?: string;

	// Actions
	onRefresh?: () => void;
	onCreateAction?: () => void;
	createActionLabel?: string;

	// Additional info
	subtitle?: string | ReactNode;

	// Layout options
	showBackButton?: boolean;
	variant?: 'default' | 'minimal';

	// Custom actions
	additionalActions?: ReactNode;
}

export function WebsitePageHeader({
	title,
	description,
	icon,
	websiteId,
	isLoading = false,
	isRefreshing = false,
	hasError = false,
	errorMessage,
	onRefresh,
	onCreateAction,
	createActionLabel = 'Create',
	subtitle,
	showBackButton = false,
	variant = 'default',
	additionalActions,
}: WebsitePageHeaderProps) {
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

	if (variant === 'minimal') {
		return (
			<div className="mb-6 flex items-center gap-3">
				{showBackButton && (
					<Button asChild size="sm" variant="ghost">
						<Link href={`/websites/${websiteId}`}>
							<ArrowLeftIcon size={16} />
							Back
						</Link>
					</Button>
				)}
				<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
					{icon}
				</div>
				<div className="flex-1">
					<h1 className="font-semibold text-xl">{title}</h1>
					{renderSubtitle()}
				</div>
				<div className="flex items-center gap-3">
					{onRefresh && (
						<Button
							className="gap-2"
							disabled={isRefreshing}
							onClick={onRefresh}
							variant="outline"
						>
							<ArrowClockwiseIcon
								className={isRefreshing ? 'animate-spin' : ''}
								size={16}
							/>
							Refresh
						</Button>
					)}
					{additionalActions}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Main Header */}
			<div className="border-b pb-6">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							{showBackButton && (
								<Button asChild className="mr-2" size="sm" variant="ghost">
									<Link href={`/websites/${websiteId}`}>
										<ArrowLeftIcon size={16} />
										Back
									</Link>
								</Button>
							)}
							<div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-3">
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
					<div className="flex items-center gap-3">
						{onRefresh && (
							<Button
								className="gap-2 border-border/50 transition-all duration-200 hover:border-primary/50 hover:bg-primary/5"
								disabled={isRefreshing}
								onClick={onRefresh}
								variant="outline"
							>
								<ArrowClockwiseIcon
									className={isRefreshing ? 'animate-spin' : ''}
									size={16}
								/>
								Refresh Data
							</Button>
						)}
						{onCreateAction && (
							<Button
								className="gap-2 bg-gradient-to-r from-primary to-primary/90 shadow-lg transition-all duration-200 hover:from-primary/90 hover:to-primary hover:shadow-xl"
								onClick={onCreateAction}
							>
								<PlusIcon size={16} />
								{createActionLabel}
							</Button>
						)}
						{additionalActions}
					</div>
				</div>
			</div>

			{/* Error State */}
			{hasError && (
				<Card className="rounded-xl border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
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
									className="gap-2 rounded-lg"
									onClick={onRefresh}
									size="sm"
									variant="outline"
								>
									<ArrowClockwiseIcon className="h-4 w-4" size={16} />
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

// Skeleton component for loading states
export function WebsitePageHeaderSkeleton() {
	return (
		<div className="space-y-6">
			<div className="border-b bg-gradient-to-r from-background via-background to-muted/20 pb-6">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
							<div>
								<div className="mb-2 h-8 w-48 animate-pulse rounded bg-muted" />
								<div className="h-4 w-64 animate-pulse rounded bg-muted" />
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
						<div className="h-10 w-36 animate-pulse rounded-lg bg-muted" />
					</div>
				</div>
			</div>
		</div>
	);
}
