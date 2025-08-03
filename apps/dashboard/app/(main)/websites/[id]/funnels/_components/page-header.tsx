'use client';

import {
	ArrowClockwiseIcon,
	PlusIcon,
	TargetIcon,
	TrendDownIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PageHeaderProps {
	funnelsCount: number;
	isRefreshing: boolean;
	isLoading: boolean;
	hasError: boolean;
	onRefresh: () => void;
	onCreateFunnel: () => void;
}

export function PageHeader({
	funnelsCount,
	isRefreshing,
	isLoading,
	hasError,
	onRefresh,
	onCreateFunnel,
}: PageHeaderProps) {
	return (
		<div className="space-y-6">
			{/* Header - matching journeys design */}
			<div className="rounded border-b bg-muted/20 py-2 pb-6">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
								<TargetIcon
									className="h-6 w-6 text-primary"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<h1 className="font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
									Conversion Funnels
								</h1>
								<p className="text-muted-foreground text-sm sm:text-base">
									Track user journeys and optimize conversion drop-off points
								</p>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button
							className="gap-2 rounded-lg border-border/50 px-4 py-2 font-medium transition-all duration-300 hover:border-primary/50 hover:bg-primary/5"
							disabled={isRefreshing}
							onClick={onRefresh}
							variant="outline"
						>
							<ArrowClockwiseIcon
								className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
								size={16}
								weight="fill"
							/>
							Refresh Data
						</Button>
						<Button
							className="group relative gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-primary to-primary/90 px-4 py-2 font-medium transition-all duration-300 hover:from-primary/90 hover:to-primary"
							onClick={onCreateFunnel}
						>
							<div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-[100%]" />
							<PlusIcon
								className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:rotate-90"
								size={16}
							/>
							<span className="relative z-10">Create Funnel</span>
						</Button>
					</div>
				</div>
			</div>

			{/* Error State */}
			{hasError && (
				<Card className="rounded-xl border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
					<CardContent className="pt-6">
						<div className="flex flex-col items-center space-y-3 text-center">
							<div className="rounded-full border border-destructive/20 bg-destructive/10 p-3">
								<TrendDownIcon
									className="h-6 w-6 text-destructive"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<h4 className="font-semibold text-destructive">
									Error loading funnel data
								</h4>
								<p className="mt-1 text-destructive/80 text-sm">
									There was an issue loading your funnels. Please try refreshing
									the page.
								</p>
							</div>
							<Button
								className="gap-2 rounded-lg"
								onClick={onRefresh}
								size="sm"
								variant="outline"
							>
								<ArrowClockwiseIcon
									className="h-4 w-4"
									size={16}
									weight="fill"
								/>
								Retry
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Funnels Grid Header */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-xl">Your Funnels</h2>
					<div className="text-muted-foreground text-sm">
						{isLoading ? (
							<div className="h-4 w-16 animate-pulse rounded bg-muted" />
						) : (
							`${funnelsCount} funnel${funnelsCount !== 1 ? 's' : ''}`
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
