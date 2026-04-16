import { Skeleton } from "@/components/ui/skeleton";

function MonitorRowSkeleton() {
	return (
		<div className="overflow-hidden rounded border bg-card">
			<div className="flex items-center justify-between px-4 pt-4 pb-3">
				<div className="flex items-center gap-2.5">
					<Skeleton className="size-5 rounded-full" />
					<div className="space-y-1.5">
						<Skeleton className="h-3.5 w-32 rounded" />
						<Skeleton className="h-3 w-24 rounded" />
					</div>
				</div>
				<Skeleton className="h-4 w-16 rounded" />
			</div>
			<div className="px-4 pb-4">
				<Skeleton className="h-8 w-full rounded" />
				<div className="mt-1.5 flex justify-between">
					<Skeleton className="h-2.5 w-16 rounded" />
					<Skeleton className="h-2.5 w-10 rounded" />
				</div>
			</div>
		</div>
	);
}

export default function StatusLoading() {
	return (
		<div className="flex h-dvh flex-col overflow-hidden bg-background">
			<div className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-lg">
				<nav className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4 sm:px-6">
					<div className="flex items-center gap-2">
						<Skeleton className="size-5 rounded" />
						<Skeleton className="h-4 w-28 rounded" />
					</div>
					<Skeleton className="size-8 rounded" />
				</nav>
			</div>

			<main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
					<div>
						<Skeleton className="h-7 w-48 rounded" />
						<Skeleton className="mt-2 h-4 w-40 rounded" />
					</div>

					<Skeleton className="h-14 w-full rounded" />

					<div className="space-y-3">
						<MonitorRowSkeleton />
						<MonitorRowSkeleton />
						<MonitorRowSkeleton />
					</div>

					<Skeleton className="h-3.5 w-52 rounded" />
				</div>
			</main>

			<footer className="shrink-0 border-t bg-background">
				<div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-3 sm:px-6">
					<Skeleton className="h-3 w-36 rounded" />
				</div>
			</footer>
		</div>
	);
}
