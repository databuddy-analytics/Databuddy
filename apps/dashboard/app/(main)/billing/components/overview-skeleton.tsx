import { Skeleton } from "@/components/ui/skeleton";

export function OverviewSkeleton() {
	return (
		<div className="flex h-full flex-col overflow-y-auto lg:grid lg:grid-cols-[1fr_20rem] lg:overflow-hidden">
			<div className="shrink-0 lg:h-full lg:min-h-0 lg:overflow-y-auto">
				<div className="border-b px-5 py-4">
					<Skeleton className="mb-1 h-5 w-20" />
					<Skeleton className="h-4 w-40" />
				</div>
				<div className="divide-y">
					{[1, 2, 3].map((i) => (
						<div className="px-5 py-4" key={i}>
							<div className="mb-3 flex items-center gap-3">
								<Skeleton className="h-10 w-10 rounded" />
								<div>
									<Skeleton className="mb-1 h-4 w-24" />
									<Skeleton className="h-3 w-32" />
								</div>
							</div>
							<Skeleton className="h-2 w-full rounded-full" />
						</div>
					))}
				</div>
			</div>
			<div className="flex w-full shrink-0 flex-col border-t bg-muted/30 lg:h-full lg:w-auto lg:overflow-y-auto lg:border-t-0 lg:border-l">
				<div className="border-b p-5">
					<Skeleton className="mb-3 h-5 w-28" />
					<div className="flex items-center gap-3">
						<Skeleton className="h-11 w-11 rounded" />
						<div>
							<Skeleton className="mb-1 h-4 w-20" />
							<Skeleton className="h-3 w-28" />
						</div>
					</div>
				</div>
				<div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-1 lg:gap-0 lg:p-0">
					<div className="w-full lg:w-auto lg:border-b lg:p-5">
						<Skeleton className="mb-3 h-5 w-32" />
						<Skeleton className="aspect-[1.586/1] w-full rounded-xl" />
					</div>
					<div className="flex w-full flex-col gap-2 lg:w-auto lg:p-5">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
