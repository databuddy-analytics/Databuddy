import { Skeleton } from "@/components/ui/skeleton";

export default function StatusPageDetailLoading() {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="relative flex min-h-[88px] shrink-0 items-center justify-between gap-2 border-b p-3 sm:p-4">
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<Skeleton className="size-[52px] shrink-0 rounded" />
					<div className="min-w-0 flex-1 space-y-2">
						<Skeleton className="h-7 max-w-xs rounded" />
						<Skeleton className="h-4 max-w-md rounded" />
					</div>
				</div>
				<div
					aria-hidden="true"
					className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2"
				>
					<Skeleton className="h-9 w-22 rounded sm:w-24" />
					<Skeleton className="size-9 rounded" />
					<Skeleton className="h-9 w-28 rounded" />
				</div>
			</div>

			<div className="flex h-10 shrink-0 items-center gap-2 border-border border-b bg-accent/30 px-3">
				<Skeleton className="h-4 w-24 rounded" />
				<span className="text-muted-foreground/40">/</span>
				<Skeleton className="h-4 w-28 rounded" />
			</div>

			<div className="flex h-10 shrink-0 gap-1 border-border border-b bg-accent/30 px-2">
				<Skeleton className="h-8 max-w-28 flex-1 rounded" />
				<Skeleton className="h-8 max-w-32 flex-1 rounded" />
			</div>

			<div className="min-h-0 flex-1 overflow-hidden p-4">
				<div className="space-y-3">
					<Skeleton className="h-24 w-full rounded border bg-card" />
					<Skeleton className="h-24 w-full rounded border bg-card" />
				</div>
			</div>
		</div>
	);
}
