import { Skeleton } from "@databuddy/ui";

function MonitorSkeleton() {
	return (
		<div className="px-4 py-4 sm:px-5 sm:py-5">
			<div className="flex items-center justify-between gap-4">
				<Skeleton className="h-4 w-40 rounded" />
				<Skeleton className="h-3 w-20 rounded" />
			</div>
			<Skeleton className="mt-3 h-8 w-full rounded-[2px]" />
			<div className="mt-2 flex justify-between">
				<Skeleton className="h-3 w-16 rounded" />
				<Skeleton className="h-3 w-24 rounded" />
				<Skeleton className="h-3 w-10 rounded" />
			</div>
		</div>
	);
}

export default function StatusLoading() {
	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-background">
			<div className="sticky top-0 z-30 bg-background/90 backdrop-blur-lg">
				<nav className="mx-auto flex h-14 max-w-[822px] items-center justify-between px-4 sm:px-6">
					<div className="flex min-w-0 items-center gap-2">
						<Skeleton className="size-5 rounded" />
						<Skeleton className="h-4 w-24 rounded" />
					</div>
					<Skeleton className="size-7 rounded" />
				</nav>
				<div className="mx-auto max-w-[822px] px-4 sm:px-6">
					<div className="h-px rounded-full bg-border" />
				</div>
			</div>

			<main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div className="mx-auto max-w-[822px] space-y-14 px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
					<div className="flex items-start gap-4">
						<Skeleton className="mt-1 ml-[5px] size-8 shrink-0 rounded-full" />
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-7 w-64 rounded" />
							<Skeleton className="h-4 w-full max-w-sm rounded" />
							<Skeleton className="h-3 w-36 rounded" />
						</div>
					</div>

					<div>
						<div className="mb-3 flex items-baseline justify-between">
							<Skeleton className="h-4 w-16 rounded" />
							<Skeleton className="h-3 w-40 rounded" />
						</div>
						<div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
							<MonitorSkeleton />
							<MonitorSkeleton />
							<MonitorSkeleton />
						</div>
					</div>

					<div className="space-y-3">
						<Skeleton className="h-4 w-28 rounded" />
						<div className="border-border/70 border-t pt-4">
							<Skeleton className="h-4 w-64 rounded" />
						</div>
					</div>
				</div>
			</main>

			<footer className="shrink-0 border-border/50 border-t bg-background">
				<div className="mx-auto flex max-w-[822px] items-center justify-center px-4 py-4 sm:px-6">
					<Skeleton className="h-3 w-32 rounded" />
				</div>
			</footer>
		</div>
	);
}
