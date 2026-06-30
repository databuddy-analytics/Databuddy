import { Skeleton } from "@databuddy/ui";

export function AgentLoadingSkeleton() {
	return (
		<div className="flex h-full flex-col gap-3 p-4">
			<Skeleton className="h-8 w-48 rounded" />
			<Skeleton className="h-full w-full rounded" />
		</div>
	);
}
