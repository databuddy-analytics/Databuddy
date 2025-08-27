'use client';

import { ArrowClockwiseIcon, PlusIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface PluginsPageHeaderProps {
	title: string;
	description?: string;
	icon: ReactNode;

	isLoading?: boolean;
	isRefreshing?: boolean;

	hasError?: boolean;
	errorMessage?: string;

	onRefresh?: () => void;
	onInstallExtension?: () => void;

	subtitle?: string | ReactNode;

	// Stats
	stats?: {
		installed: number;
		available: number;
		updates: number;
	};
}

export function PluginsPageHeader({
	title,
	description,
	icon,
	isLoading = false,
	isRefreshing = false,
	hasError = false,
	errorMessage,
	onRefresh,
	onInstallExtension,
	subtitle,
	stats,
}: PluginsPageHeaderProps) {
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

	const renderStats = () => {
		if (!stats || isLoading) {
			return null;
		}

		return (
			<div className="flex items-center gap-2 text-muted-foreground text-sm">
				<span>{stats.installed} installed</span>
				<span>•</span>
				<span>{stats.available} available</span>
				{stats.updates > 0 && (
					<>
						<span>•</span>
						<span className="text-amber-600">{stats.updates} updates</span>
					</>
				)}
			</div>
		);
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
								{renderStats()}
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
								/>
								Refresh
							</Button>
						)}
						{onInstallExtension && (
							<Button
								className="gap-2 bg-gradient-to-r from-primary to-primary/90 shadow-lg transition-all duration-200 hover:from-primary/90 hover:to-primary hover:shadow-xl"
								onClick={onInstallExtension}
							>
								<PlusIcon />
								Install Extension
							</Button>
						)}
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
