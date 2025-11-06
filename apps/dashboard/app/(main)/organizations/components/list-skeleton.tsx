"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface ListSkeletonProps {
	count?: number;
	showAvatar?: boolean;
	showActions?: boolean;
}

export function ListSkeleton({
	count = 6,
	showAvatar = true,
	showActions = true,
}: ListSkeletonProps) {
	return (
		<div className="h-full p-4 sm:p-6">
			<div className="space-y-3 sm:space-y-4">
				{Array.from({ length: count }).map((_, i) => (
					<div
						className="flex items-center gap-3 rounded-lg border bg-card p-3 sm:gap-4 sm:p-4"
						key={i.toString()}
					>
						{showAvatar && (
							<Skeleton className="h-10 w-10 flex-shrink-0 rounded-full sm:h-12 sm:w-12" />
						)}
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-3 w-40 sm:h-4 sm:w-48" />
							<Skeleton className="h-3 w-32 sm:h-3 sm:w-40" />
						</div>
						{showActions && <Skeleton className="h-7 w-16 sm:h-8 sm:w-20" />}
					</div>
				))}
			</div>
		</div>
	);
}
