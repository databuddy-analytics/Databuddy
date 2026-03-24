"use client";

import { CoinIcon, ShoppingCartIcon, TrendUpIcon } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";

interface FeedbackCreditsCardProps {
	available: number;
	totalEarned: number;
	totalSpent: number;
	isLoading: boolean;
}

export function FeedbackCreditsCard({
	available,
	totalEarned,
	totalSpent,
	isLoading,
}: FeedbackCreditsCardProps) {
	if (isLoading) {
		return (
			<div className="flex items-center gap-6 border-b p-5">
				<div className="flex items-center gap-3">
					<Skeleton className="size-10 rounded" />
					<div className="space-y-1.5">
						<Skeleton className="h-3 w-14 rounded" />
						<Skeleton className="h-7 w-12 rounded" />
					</div>
				</div>
				<div className="h-8 w-px bg-border" />
				<div className="flex gap-6">
					{Array.from({ length: 2 }).map((_, i) => (
						<div className="space-y-1.5" key={`stat-skel-${i}`}>
							<Skeleton className="h-3 w-16 rounded" />
							<Skeleton className="h-4 w-10 rounded" />
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-6 border-b p-5">
			<div className="flex items-center gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded border bg-secondary">
					<CoinIcon
						className="text-accent-foreground"
						size={18}
						weight="duotone"
					/>
				</div>
				<div>
					<p className="text-muted-foreground text-xs">Available</p>
					<p className="font-semibold text-xl tabular-nums">
						{available.toLocaleString()}
					</p>
				</div>
			</div>

			<div className="hidden h-8 w-px bg-border sm:block" />

			<div className="flex gap-6">
				<div className="flex items-center gap-2">
					<TrendUpIcon
						className="text-muted-foreground"
						size={14}
						weight="duotone"
					/>
					<div>
						<p className="text-muted-foreground text-xs">Earned</p>
						<p className="font-medium text-sm tabular-nums">
							{totalEarned.toLocaleString()}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<ShoppingCartIcon
						className="text-muted-foreground"
						size={14}
						weight="duotone"
					/>
					<div>
						<p className="text-muted-foreground text-xs">Spent</p>
						<p className="font-medium text-sm tabular-nums">
							{totalSpent.toLocaleString()}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
