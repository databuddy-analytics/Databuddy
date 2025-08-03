'use client';

import {
	ArrowClockwiseIcon,
	ArrowLeftIcon,
	CurrencyDollarIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PageHeaderProps {
	websiteId: string;
	websiteName?: string;
	isRefreshing: boolean;
	onRefresh: () => void;
	hasError?: boolean;
	errorMessage?: string;
}

export function PageHeader({
	websiteId,
	websiteName,
	isRefreshing,
	onRefresh,
	hasError,
	errorMessage,
}: PageHeaderProps) {
	return (
		<div className="space-y-6">
			{/* Header - matching funnels design */}
			<div className="border-b bg-gradient-to-r from-background via-background to-muted/20 pb-6">
				<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
					<div className="space-y-2">
						<div className="flex items-center gap-3">
							<Button asChild className="mr-2" size="sm" variant="ghost">
								<Link href={`/websites/${websiteId}`}>
									<ArrowLeftIcon size={16} />
									Back
								</Link>
							</Button>
							<div className="rounded-xl border border-green-200 bg-green-100 p-3 dark:border-green-800 dark:bg-green-900/20">
								<CurrencyDollarIcon
									className="h-6 w-6 text-green-600 dark:text-green-400"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<h1 className="font-bold text-2xl text-foreground tracking-tight sm:text-3xl">
									Revenue Analytics
								</h1>
								<p className="text-muted-foreground text-sm sm:text-base">
									Track revenue and transaction data for{' '}
									{websiteName || 'this website'}
								</p>
							</div>
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Button
							className="gap-2 rounded-lg border-border/50 px-4 py-2 font-medium transition-all duration-300 hover:border-primary/50 hover:bg-primary/5"
							disabled={isRefreshing}
							onClick={onRefresh}
							size="default"
							variant="outline"
						>
							<ArrowClockwiseIcon
								className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
								size={16}
								weight="fill"
							/>
							Refresh Data
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
								<WarningCircleIcon
									className="h-6 w-6 text-destructive"
									size={16}
									weight="duotone"
								/>
							</div>
							<div>
								<h4 className="font-semibold text-destructive">
									Error loading revenue data
								</h4>
								<p className="mt-1 text-destructive/80 text-sm">
									{errorMessage ||
										'There was an issue loading your revenue data. Please try refreshing the page.'}
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
		</div>
	);
}
