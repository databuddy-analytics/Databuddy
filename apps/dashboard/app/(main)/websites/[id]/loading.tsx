import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="select-none space-y-6 p-6">
			{/* Key metrics cards skeleton */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
				{[1, 2, 3, 4, 5, 6].map((num) => (
					<div
						className="rounded border bg-sidebar p-4"
						key={`metric-skeleton-${num}`}
					>
						<div className="space-y-2">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-8 w-16" />
							<Skeleton className="h-3 w-16" />
						</div>
					</div>
				))}
			</div>

			{/* Chart skeleton */}
			<div className="rounded border border-sidebar-border bg-sidebar shadow-sm">
				<div className="flex flex-col items-start justify-between gap-3 border-sidebar-border border-b p-4 sm:flex-row">
					<div className="space-y-2">
						<Skeleton className="h-5 w-32" />
						<Skeleton className="h-4 w-48" />
					</div>
					<div className="flex gap-2">
						<Skeleton className="h-8 w-20" />
						<Skeleton className="h-8 w-20" />
						<Skeleton className="h-8 w-20" />
					</div>
				</div>
				<div className="p-4">
					<Skeleton className="h-80 w-full" />
				</div>
			</div>

			{/* Data tables skeleton */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{[1, 2].map((tableNum) => (
					<div
						className="rounded border border-sidebar-border bg-sidebar"
						key={`table-skeleton-${tableNum}`}
					>
						<div className="border-sidebar-border border-b p-4">
							<Skeleton className="h-5 w-24" />
							<Skeleton className="mt-1 h-4 w-32" />
						</div>
						<div className="space-y-3 p-4">
							{[1, 2, 3, 4, 5].map((rowNum) => (
								<div
									className="flex items-center justify-between"
									key={`row-skeleton-${rowNum}`}
								>
									<div className="flex items-center gap-3">
										<Skeleton className="h-4 w-4" />
										<Skeleton className="h-4 w-32" />
									</div>
									<div className="flex items-center gap-4">
										<Skeleton className="h-4 w-12" />
										<Skeleton className="h-5 w-10 rounded-full" />
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>

			{/* Technology breakdown skeleton */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				{[1, 2, 3].map((techNum) => (
					<div
						className="rounded border border-sidebar-border bg-sidebar"
						key={`tech-skeleton-${techNum}`}
					>
						<div className="border-sidebar-border border-b p-4">
							<Skeleton className="h-5 w-20" />
							<Skeleton className="mt-1 h-4 w-28" />
						</div>
						<div className="space-y-3 p-4">
							{[1, 2, 3, 4].map((rowNum) => (
								<div
									className="flex items-center justify-between"
									key={`tech-row-skeleton-${rowNum}`}
								>
									<div className="flex items-center gap-3">
										<Skeleton className="h-6 w-6" />
										<Skeleton className="h-4 w-24" />
									</div>
									<div className="flex items-center gap-3">
										<Skeleton className="h-4 w-8" />
										<Skeleton className="h-5 w-12 rounded-full" />
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
