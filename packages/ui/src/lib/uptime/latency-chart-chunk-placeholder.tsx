import { Skeleton } from "../../components/skeleton";

/** Same footprint as collapsed LatencyChart row — use with next/dynamic loading to avoid CLS */
export function LatencyChartChunkPlaceholder() {
	return (
		<div>
			<div
				aria-hidden
				className="mt-1.5 flex min-h-11 items-center gap-2 rounded-lg px-2 py-2"
			>
				<Skeleton className="size-6 rounded-full" />
				<Skeleton className="h-4 w-28 rounded" />
				<div className="ml-auto flex items-center gap-1.5">
					<Skeleton className="h-4 w-16 rounded-full" />
					<Skeleton className="h-4 w-16 rounded-full" />
				</div>
				<Skeleton className="size-3 shrink-0 rounded" />
			</div>
		</div>
	);
}
