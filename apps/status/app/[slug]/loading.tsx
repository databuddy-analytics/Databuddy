import { Skeleton } from "@databuddy/ui";

function MonitorSkeleton() {
	return (
		<div className="overflow-hidden rounded-xl border border-border/60 bg-card">
			<div className="flex items-center gap-2 p-4 sm:gap-3 sm:p-5">
				<Skeleton className="size-3 shrink-0 rounded" />
				<Skeleton className="h-4 w-48 rounded" />
				<Skeleton className="ml-auto h-3 w-20 shrink-0 rounded" />
			</div>
			<div className="px-4 pt-1 pb-4 sm:px-5">
				<Skeleton className="h-1.5 w-full rounded-full" />
				<div className="mt-2 flex justify-between">
					<Skeleton className="h-3 w-16 rounded" />
					<Skeleton className="h-3 w-24 rounded" />
					<Skeleton className="h-3 w-10 rounded" />
				</div>
				<div className="mt-3 border-border/60 border-t pt-4">
					<Skeleton className="h-4 w-32 rounded" />
				</div>
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
				<div className="mx-auto max-w-[822px] space-y-12 px-4 py-8 sm:px-6">
					<div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
						<div className="flex items-center gap-3">
							<Skeleton className="size-2.5 shrink-0 rounded-full" />
							<Skeleton className="h-5 w-52 rounded" />
							<Skeleton className="ml-auto hidden h-3 w-36 rounded sm:block" />
						</div>
						<Skeleton className="mt-2 ml-[22px] h-4 w-full max-w-sm rounded" />
					</div>

					<div className="flex flex-col gap-5">
						<MonitorSkeleton />
						<MonitorSkeleton />
						<MonitorSkeleton />
					</div>

					<div className="space-y-4">
						<Skeleton className="h-4 w-28 rounded" />
						<div className="border-border/70 border-t pt-4">
							<Skeleton className="h-4 w-64 rounded" />
						</div>
					</div>
				</div>
			</main>

			<footer className="shrink-0 border-border/50 border-t bg-background">
				<div className="mx-auto flex max-w-[822px] items-center justify-center px-4 py-6 sm:px-6">
					<Skeleton className="h-4 w-36 rounded" />
				</div>
			</footer>
		</div>
	);
}
