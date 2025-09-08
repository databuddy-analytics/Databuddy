'use client';

import {
	ArrowClockwiseIcon,
	GlobeIcon,
	PlusIcon,
	TrendUpIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WebsiteDialog } from '@/components/website-dialog';
import { useWebsites } from '@/hooks/use-websites';

import { cn } from '@/lib/utils';
import { WebsiteCard } from './_components/website-card';

function LoadingSkeleton() {
	return (
		<div className="grid select-none gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{[1, 2, 3, 4, 5, 6].map((num) => (
				<Card
					className="animate-pulse overflow-hidden"
					key={`website-skeleton-${num}`}
				>
					<CardHeader className="pb-2">
						<div className="flex items-center justify-between">
							<div className="flex-1 space-y-2">
								<Skeleton className="h-4 w-32 rounded" />
								<div className="flex items-center gap-1">
									<Skeleton className="h-3 w-3 rounded" />
									<Skeleton className="h-3 w-24 rounded" />
								</div>
							</div>
							<Skeleton className="h-4 w-4 rounded" />
						</div>
					</CardHeader>
					<CardContent className="pt-0 pb-3">
						<div className="space-y-2">
							<div className="flex justify-between">
								<Skeleton className="h-3 w-12 rounded" />
								<Skeleton className="h-3 w-8 rounded" />
							</div>
							<Skeleton className="h-12 w-full rounded" />
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function EmptyState({ onAddWebsite }: { onAddWebsite: () => void }) {
	return (
		<Card className="fade-in-50 animate-in rounded border-2 border-dashed bg-gradient-to-br from-background to-muted/20 duration-700">
			<CardContent className="flex flex-col items-center justify-center px-8 py-16">
				<div className="group relative mb-8">
					<div className="rounded-full border-2 border-primary/20 bg-primary/10 p-6">
						<GlobeIcon
							aria-hidden="true"
							className="h-16 w-16 text-primary"
							size={16}
							weight="duotone"
						/>
					</div>
					<div className="-top-2 -right-2 absolute animate-pulse rounded-full border-2 border-primary/20 bg-background p-2 shadow-sm">
						<PlusIcon className="h-6 w-6 text-primary" size={16} />
					</div>
				</div>
				<div className="max-w-md space-y-4 text-center">
					<h3 className="font-semibold text-2xl text-foreground">
						No websites yet
					</h3>
					<p className="text-muted-foreground leading-relaxed">
						Start tracking your website analytics by adding your first website.
						Get insights into visitors, pageviews, and performance.
					</p>
					<div className="pt-2">
						<Button
							className={cn(
								'gap-2 rounded-lg px-8 py-4 font-medium text-base',
								'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary',
								'group relative overflow-hidden transition-all duration-300'
							)}
							data-button-type="primary-cta"
							data-section="empty-state"
							data-track="websites-add-first-website"
							onClick={onAddWebsite}
							size="lg"
						>
							<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-[100%]" />
							<PlusIcon
								className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:rotate-90"
								size={16}
							/>
							<span className="relative z-10">Create Your First Website</span>
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<div className="flex select-none flex-col items-center justify-center px-4 py-16 text-center">
			<div className="mb-8 rounded-full border border-destructive/20 bg-destructive/10 p-8">
				<GlobeIcon
					aria-hidden="true"
					className="h-16 w-16 text-destructive"
					size={64}
					weight="duotone"
				/>
			</div>
			<h3 className="mb-4 font-bold text-2xl">Failed to Load Websites</h3>
			<p className="mb-8 max-w-md text-muted-foreground leading-relaxed">
				There was an issue fetching your websites. Please check your connection
				and try again.
			</p>
			<Button
				data-section="error-state"
				data-track="websites-retry-load"
				onClick={onRetry}
				size="lg"
				variant="outline"
			>
				Try Again
			</Button>
		</div>
	);
}

export default function WebsitesPage() {
	const [dialogOpen, setDialogOpen] = useState(false);

	const { websites, chartData, isLoading, isError, isFetching, refetch } =
		useWebsites();

	const handleRetry = () => {
		refetch();
	};

	return (
		<div className="flex h-full flex-col">
			{/* Enhanced header */}
			<div className="border-b">
				<div className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center sm:gap-0 sm:px-4 sm:py-4">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-3">
							<div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
								<TrendUpIcon
									aria-hidden="true"
									className="h-5 w-5 text-primary"
									size={24}
									weight="fill"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<h1 className="truncate font-bold text-foreground text-xl tracking-tight sm:text-2xl">
									Websites
								</h1>
								<p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
									Track analytics for all your websites
								</p>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							aria-label="Refresh websites"
							disabled={isLoading || isFetching}
							onClick={() => refetch()}
							size="icon"
							variant="outline"
						>
							<ArrowClockwiseIcon
								aria-hidden
								className={`h-4 w-4 ${isLoading || isFetching ? 'animate-spin' : ''}`}
							/>
						</Button>
						<Button
							className={cn(
								'gap-2 px-3 py-2 font-medium sm:px-4 sm:py-2',
								'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary',
								'group relative overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl'
							)}
							data-button-type="primary"
							data-section="header"
							data-track="websites-new-website-header"
							onClick={() => setDialogOpen(true)}
							size="default"
						>
							<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-[100%]" />
							<PlusIcon className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
							<span className="relative z-10 truncate">New Website</span>
						</Button>
					</div>
				</div>
			</div>

			{/* Content area */}
			<div
				aria-busy={isFetching}
				className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"
			>
				{/* Website count indicator */}
				{!isLoading && websites && websites.length > 0 && (
					<div className="mb-6">
						<div className="flex items-center gap-2 rounded-lg border border-muted bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
							<GlobeIcon
								aria-hidden="true"
								className="h-4 w-4 flex-shrink-0"
								size={24}
								weight="duotone"
							/>
							<span className="truncate">
								Tracking{' '}
								<span className="font-medium text-foreground">
									{websites.length}
								</span>{' '}
								website{websites.length !== 1 ? 's' : ''}
							</span>
						</div>
					</div>
				)}

				{/* Show loading state */}
				{isLoading && <LoadingSkeleton />}

				{/* Show error state */}
				{isError && <ErrorState onRetry={handleRetry} />}

				{/* Show empty state */}
				{!(isLoading || isError) && websites && websites.length === 0 && (
					<EmptyState onAddWebsite={() => setDialogOpen(true)} />
				)}

				{/* Show website grid */}
				{!(isLoading || isError) && websites && websites.length > 0 && (
					<div
						aria-live="polite"
						className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
					>
						{websites.map((website) => (
							<WebsiteCard
								chartData={chartData?.[website.id]}
								isLoadingChart={isLoading || isFetching}
								key={website.id}
								website={website}
							/>
						))}
					</div>
				)}
			</div>

			{/* Website Dialog */}
			<WebsiteDialog onOpenChange={setDialogOpen} open={dialogOpen} />
		</div>
	);
}
