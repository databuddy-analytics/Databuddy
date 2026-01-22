"use client";

import { Skeleton } from"@/components/ui/skeleton";

export function LlmLoadingSkeleton() {
	return (
		<div className="space-y-3 sm:space-y-4">
			{/* StatCards Grid */}
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
				{Array.from({ length: 5 }).map((_, i) => (
					<div
						className="overflow-hidden border bg-card"
						key={`stat-skeleton-${i + 1}`}
					>
						<div className="dotted-bg bg-accent pt-2">
							<Skeleton className="h-24 w-full" />
						</div>
						<div className="flex items-center gap-2.5 border-t px-2.5 py-2.5">
							<Skeleton className="size-7 shrink-0" />
							<div className="min-w-0 flex-1 space-y-0.5">
								<Skeleton className="h-5 w-14" />
								<Skeleton className="h-3 w-12" />
							</div>
						</div>
					</div>
				))}
			</div>

			{/* Tabs Card */}
			<div className=" border bg-card">
				<div className="flex items-center justify-between border-b px-4 py-3">
					<div className="space-y-1">
						<Skeleton className="h-5 w-32" />
						<Skeleton className="h-4 w-48" />
					</div>
					<Skeleton className="h-9 w-80" />
				</div>

				<div className="space-y-4 p-4">
					{/* Charts */}
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<div className=" border bg-card">
							<div className="border-b px-4 py-3">
								<Skeleton className="h-5 w-24" />
								<Skeleton className="mt-1 h-3 w-32" />
							</div>
							<Skeleton className="h-[220px] w-full" />
						</div>
						<div className=" border bg-card">
							<div className="border-b px-4 py-3">
								<Skeleton className="h-5 w-24" />
								<Skeleton className="mt-1 h-3 w-32" />
							</div>
							<Skeleton className="h-[220px] w-full" />
						</div>
					</div>

					{/* Full width chart */}
					<div className=" border bg-card">
						<div className="border-b px-4 py-3">
							<Skeleton className="h-5 w-24" />
							<Skeleton className="mt-1 h-3 w-32" />
						</div>
						<Skeleton className="h-[240px] w-full" />
					</div>

					{/* Data table */}
					<div className=" border bg-card">
						<div className="border-b px-4 py-3">
							<Skeleton className="h-5 w-28" />
							<Skeleton className="mt-1 h-3 w-48" />
						</div>
						<div className="p-4">
							<Skeleton className="h-64 w-full" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
