import { Skeleton } from '@/components/ui/skeleton';

export function LoadingSkeleton() {
	return (
		<div>
			{Array.from({ length: 4 }, (_, i) => (
				<div
					className="border-b bg-card transition-colors hover:bg-muted/20"
					key={i}
				>
					<div className="flex items-center justify-between p-4">
						<div className="flex min-w-0 flex-1 items-center space-x-4">
							<Skeleton className="h-4 w-4" />
							<Skeleton className="h-8 w-8 rounded" />
							<div className="flex items-center space-x-2">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-4 w-16" />
							</div>
						</div>

						<div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-2 text-muted-foreground text-sm sm:grid-cols-[150px_1fr_100px_70px] sm:gap-4 lg:grid-cols-[200px_1fr_120px_80px]">
							<div className="flex justify-start">
								<Skeleton className="h-6 w-24" />
							</div>
							<div className="flex justify-center">
								<Skeleton className="h-4 w-32" />
							</div>
							<div className="hidden justify-center sm:flex">
								<Skeleton className="h-4 w-16" />
							</div>
							<div className="flex justify-end">
								<Skeleton className="h-4 w-12" />
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
