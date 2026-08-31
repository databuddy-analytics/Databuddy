import { Skeleton } from "@databuddy/ui";

function MonitorSkeleton() {
	return (
		<div className="overflow-hidden rounded-xl border border-border/60 bg-card">
			<div className="flex items-start gap-2 p-3 sm:gap-3 sm:p-4">
				<div className="shrink-0 p-1">
					<Skeleton className="size-3 rounded" />
				</div>
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<div className="min-w-0 flex-1 space-y-1.5">
						<Skeleton className="h-4 w-40 rounded" />
						<Skeleton className="h-3 w-56 rounded" />
					</div>
					<Skeleton className="h-4 w-24 shrink-0 rounded" />
				</div>
			</div>
			<div className="border-border/60 border-t bg-muted/30 px-5 py-5 sm:px-6 sm:py-6">
				<div className="mb-3 flex justify-between">
					<Skeleton className="h-4 w-20 rounded" />
					<Skeleton className="h-4 w-12 rounded" />
				</div>
				<Skeleton className="h-1.5 w-full rounded-full" />
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
					<div className="overflow-hidden rounded-xl border border-border/60 bg-card">
						<div className="flex items-start gap-2 border-border/60 border-b bg-muted/30 p-3 sm:p-4">
							<div className="shrink-0 p-1">
								<Skeleton className="size-3 rounded" />
							</div>
							<div className="flex min-w-0 flex-1 items-baseline gap-3">
								<Skeleton className="h-4 w-44 rounded" />
								<Skeleton className="ml-auto h-4 w-20 shrink-0 rounded" />
							</div>
						</div>
						<div className="flex gap-3 px-4 py-3 sm:py-5 sm:pl-[25px]">
							<Skeleton className="w-0.5 self-stretch rounded-full" />
							<Skeleton className="h-4 w-full max-w-md rounded" />
						</div>
					</div>

					<div className="flex flex-col gap-5">
						<MonitorSkeleton />
						<MonitorSkeleton />
						<MonitorSkeleton />
					</div>

					<div className="flex items-center justify-between">
						<Skeleton className="h-3 w-48 rounded" />
						<Skeleton className="h-3 w-28 rounded" />
					</div>
				</div>
			</main>

			<footer className="shrink-0 border-border/50 border-t bg-background">
				<div className="mx-auto flex max-w-[822px] items-center justify-center px-4 py-4 sm:px-6">
					<Skeleton className="h-3 w-28 rounded" />
				</div>
			</footer>
		</div>
	);
}
